import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import type { Rectangle } from 'electron';
import type { AppType } from '@shared/types/index.js';

export interface WebViewConfig {
  windowId: string;
  appType: AppType;
  bounds: Rectangle;
  initialUrl?: string;
  /**
   * Extra offset from the top of the window in pixels, beyond the standard
   * title bar (38px). Used by apps like Browser that have an in-window
   * header (URL bar, toolbar) which must not be overlapped by the view.
   * The renderer is the source of truth for this value because it knows
   * the exact height of its chrome.
   */
  extraTopOffset?: number;
}

export interface WebContentState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

/**
 * Hand input event coming from the renderer.
 * Coordinates are already mapped to be local to the WebContentsView.
 *
 * NOTE: Only standard Electron MouseInputEvent / KeyboardInputEvent types are used here.
 * Do NOT add mouseDragMove/mouseDragEnd — Electron's sendInputEvent does not
 * support drag events. Use the standard mouseDown + mouseMove (with buttons=['left'])
 * + mouseUp pattern for drag instead.
 */
export type HandInputEvent =
  | { type: 'mouseMove'; x: number; y: number; buttons?: ('left' | 'right' | 'middle')[] }
  | { type: 'mouseDown'; x: number; y: number; button: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'mouseUp'; x: number; y: number; button: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'mouseWheel'; x: number; y: number; deltaX?: number; deltaY?: number; wheelTicks?: number };

/**
 * Keyboard event coming from the renderer.
 * `key` is the JavaScript KeyboardEvent.key value (e.g. 'a', 'A', 'Enter', 'Backspace').
 * `code` is the physical key code (e.g. 'KeyA', 'Enter').
 * If only `key` is provided, the manager derives `code` automatically.
 */
export type HandKeyEvent = {
  type: 'keyDown' | 'keyUp' | 'char';
  key: string;
  code?: string;
  modifiers?: ('shift' | 'control' | 'alt' | 'meta')[];
};

/**
 * Manages Electron WebContentsView instances for native web applications
 * like YouTube, browser, etc.
 * 
 * Lifecycle:
 * - create() when virtual window opens
 * - updateBounds() when window moves/resizes
 * - setVisible() when minimize/restore
 * - destroy() when window closes
 */
export class WebContentManager {
  private views = new Map<string, WebContentsView>();
  /** IDs that are currently being created (between call entry and `views.set`) */
  private creating = new Set<string>();
  /** Extra top offset (px) per window, beyond the default 38px title bar. */
  private extraTopOffsets = new Map<string, number>();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  create(config: WebViewConfig): string {
    if (!this.mainWindow) {
      throw new Error('Main window not set');
    }

    // Prevent duplicates — both already-created and in-flight
    if (this.views.has(config.windowId) || this.creating.has(config.windowId)) {
      return config.windowId;
    }

    // Reserve the id synchronously so a second call that arrives before the
    // first finishes will be rejected here instead of leaking a duplicate view.
    this.creating.add(config.windowId);

    // Authoritative title-bar offset — apply here so the view NEVER covers
    // the React title bar, regardless of what the renderer sent. The renderer
    // may pass either window bounds or content bounds; we always re-derive
    // content bounds ourselves. Apps like Browser that add an in-window
    // toolbar (URL bar) can pass `extraTopOffset` so the view is pushed
    // down past that chrome.
    const TITLE_BAR_HEIGHT = 38;
    const FRAME_BORDER = 2;
    const extraTop = Math.max(0, config.extraTopOffset ?? 0);
    const safeBounds: Rectangle = {
      x: Math.floor((config.bounds?.x ?? 0) + FRAME_BORDER),
      y: Math.floor((config.bounds?.y ?? 0) + TITLE_BAR_HEIGHT + extraTop + FRAME_BORDER),
      width: Math.max(
        1,
        Math.floor((config.bounds?.width ?? 0) - FRAME_BORDER * 2)
      ),
      height: Math.max(
        1,
        Math.floor(
          (config.bounds?.height ?? 0) - TITLE_BAR_HEIGHT - extraTop - FRAME_BORDER * 2
        )
      )
    };

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        javascript: true,
        images: true,
        webgl: true
      }
    });

    // Load appropriate URL based on app type
    const url = config.initialUrl ?? this.getUrlForAppType(config.appType);

    try {
      // Set initial bounds BEFORE loading URL
      view.setBounds(safeBounds);

      // Add to main window BEFORE loading
      this.mainWindow.contentView.addChildView(view);

      // Now load URL
      void view.webContents.loadURL(url);

      // Store reference
      this.views.set(config.windowId, view);
      this.extraTopOffsets.set(config.windowId, extraTop);
      this.creating.delete(config.windowId);

      // Debug logging
      console.log(`[WebContentManager] Created view for ${config.appType} (${config.windowId})`);
      console.log(`[WebContentManager] Received bounds:`, config.bounds);
      console.log(`[WebContentManager] Applied content bounds:`, safeBounds);
      console.log(`[WebContentManager] Loading:`, url);

      // Listen for load events
      view.webContents.on('did-finish-load', () => {
        console.log(`[WebContentManager] ${config.windowId} loaded successfully`);
      });

      view.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error(`[WebContentManager] ${config.windowId} failed to load:`, errorCode, errorDescription);
      });

      return config.windowId;
    } catch (err) {
      // Roll back the reservation if anything failed so the caller can retry
      this.creating.delete(config.windowId);
      try {
        if (!view.webContents.isDestroyed()) view.webContents.close();
        this.mainWindow.contentView.removeChildView(view);
      } catch { /* best effort */ }
      throw err;
    }
  }

  updateBounds(windowId: string, bounds: Rectangle): void {
    const view = this.views.get(windowId);
    if (!view) {
      console.warn(`[WebContentManager] View not found for window ${windowId}`);
      return;
    }
    // Re-apply title bar offset so the view never overlaps the React title bar.
    const TITLE_BAR_HEIGHT = 38;
    const FRAME_BORDER = 2;
    const extraTop = this.extraTopOffsets.get(windowId) ?? 0;
    const safeBounds: Rectangle = {
      x: Math.floor((bounds?.x ?? 0) + FRAME_BORDER),
      y: Math.floor((bounds?.y ?? 0) + TITLE_BAR_HEIGHT + extraTop + FRAME_BORDER),
      width: Math.max(1, Math.floor((bounds?.width ?? 0) - FRAME_BORDER * 2)),
      height: Math.max(
        1,
        Math.floor((bounds?.height ?? 0) - TITLE_BAR_HEIGHT - extraTop - FRAME_BORDER * 2)
      )
    };
    view.setBounds(safeBounds);
    console.log(`[WebContentManager] Updated bounds for ${windowId}:`, safeBounds);
  }

  setVisible(windowId: string, visible: boolean): void {
    const view = this.views.get(windowId);
    if (!view) return;
    
    view.setVisible(visible);
    console.log(`[WebContentManager] Set ${windowId} visible:`, visible);
  }

  destroy(windowId: string): void {
    const view = this.views.get(windowId);
    if (!view || !this.mainWindow) {
      // Already destroyed (or never created) — silently ignore. This makes
      // destroy() idempotent so React effect cleanups and explicit close
      // handlers can both call destroy() safely.
      this.creating.delete(windowId);
      this.extraTopOffsets.delete(windowId);
      return;
    }

    // Remove from window
    try {
      this.mainWindow.contentView.removeChildView(view);
    } catch (err) {
      console.warn(`[WebContentManager] removeChildView failed for ${windowId}:`, err);
    }

    // Destroy webContents to free memory
    if (!view.webContents.isDestroyed()) {
      try {
        view.webContents.close();
      } catch (err) {
        console.warn(`[WebContentManager] webContents.close failed for ${windowId}:`, err);
      }
    }

    // Remove from map
    this.views.delete(windowId);
    this.extraTopOffsets.delete(windowId);
    this.creating.delete(windowId);

    console.log(`[WebContentManager] Destroyed view for window ${windowId}`);
  }

  has(windowId: string): boolean {
    return this.views.has(windowId);
  }

  getView(windowId: string): WebContentsView | undefined {
    return this.views.get(windowId);
  }

  destroyAll(): void {
    for (const windowId of Array.from(this.views.keys())) {
      this.destroy(windowId);
    }
  }

  /**
   * Navigate to a URL. Returns true if loaded.
   */
  navigate(windowId: string, url: string): boolean {
    const view = this.views.get(windowId);
    if (!view || view.webContents.isDestroyed()) return false;
    void view.webContents.loadURL(url);
    console.log(`[WebContentManager] Navigate ${windowId} →`, url);
    return true;
  }

  back(windowId: string): void {
    const view = this.views.get(windowId);
    if (view && view.webContents.canGoBack()) view.webContents.goBack();
  }

  forward(windowId: string): void {
    const view = this.views.get(windowId);
    if (view && view.webContents.canGoForward()) view.webContents.goForward();
  }

  reload(windowId: string): void {
    const view = this.views.get(windowId);
    if (view) view.webContents.reload();
  }

  /**
   * Send a hand-mapped input event to the WebContentsView.
   * Coordinates are expected to be local to the view.
   */
  injectInput(windowId: string, event: HandInputEvent): boolean {
    const view = this.views.get(windowId);
    if (!view || view.webContents.isDestroyed()) return false;

    // sendInputEvent requires the BrowserWindow to have focus.
    // Focus once per gesture (cheap heuristic: focus on mouseDown).
    if (event.type === 'mouseDown') {
      if (this.mainWindow && !this.mainWindow.isFocused()) {
        this.mainWindow.focus();
      }
    }

    try {
      if (event.type === 'mouseMove') {
        view.webContents.sendInputEvent({
          type: 'mouseMove',
          x: event.x,
          y: event.y,
          // buttons: Electron expects a bitmask (number), not an array of strings.
          // Convert ['left'] → 1, ['left','right'] → 3, etc.
          buttons: event.buttons ? this.buttonArrayToBitmask(event.buttons) : 0
        } as Electron.MouseInputEvent);
      } else if (event.type === 'mouseDown') {
        view.webContents.sendInputEvent({
          type: 'mouseDown',
          x: event.x,
          y: event.y,
          button: event.button,
          clickCount: event.clickCount ?? 1
        } as Electron.MouseInputEvent);
      } else if (event.type === 'mouseUp') {
        view.webContents.sendInputEvent({
          type: 'mouseUp',
          x: event.x,
          y: event.y,
          button: event.button,
          clickCount: event.clickCount ?? 1
        } as Electron.MouseInputEvent);
      } else if (event.type === 'mouseWheel') {
        // deltaY: positive = scroll down, negative = scroll up
        // wheelTicks: each tick = 120 units (Chromium convention)
        const WHEEL_TICK = 120;
        const deltaY = event.wheelTicks !== undefined
          ? event.wheelTicks * WHEEL_TICK
          : (event.deltaY ?? 0);
        view.webContents.sendInputEvent({
          type: 'mouseWheel',
          x: event.x,
          y: event.y,
          deltaX: event.deltaX ?? 0,
          deltaY
        } as Electron.MouseInputEvent);
      }
      return true;
    } catch (err) {
      console.error(`[WebContentManager] injectInput failed for ${windowId}:`, err);
      return false;
    }
  }

  /**
   * Convert ['left', 'right', 'middle'] → Electron button bitmask.
   * left=1, right=2, middle=4
   */
  private buttonArrayToBitmask(buttons: ('left' | 'right' | 'middle')[]): number {
    let mask = 0;
    if (buttons.includes('left')) mask |= 1;
    if (buttons.includes('right')) mask |= 2;
    if (buttons.includes('middle')) mask |= 4;
    return mask;
  }

  /**
   * Send a keyboard event to the WebContentsView.
   * Used by the virtual keyboard so the user can type into web forms.
   */
  injectKey(windowId: string, event: HandKeyEvent): boolean {
    const view = this.views.get(windowId);
    if (!view || view.webContents.isDestroyed()) return false;

    try {
      view.webContents.sendInputEvent({
        type: event.type,
        keyCode: event.key,
        code: event.code ?? '',
        key: event.key,
        modifiers: event.modifiers ?? []
      } as unknown as Electron.KeyboardInputEvent);
      return true;
    } catch (err) {
      console.error(`[WebContentManager] injectKey failed for ${windowId}:`, err);
      return false;
    }
  }

  /**
   * Snapshot of navigation state for the Browser chrome.
   */
  getState(windowId: string): WebContentState {
    const view = this.views.get(windowId);
    if (!view || view.webContents.isDestroyed()) {
      return {
        url: '',
        title: '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false
      };
    }
    const wc = view.webContents;
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      isLoading: wc.isLoading(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward()
    };
  }

  /**
   * Subscribe to navigation events for a window. Returns an unsubscribe function.
   */
  onStateChange(windowId: string, cb: (state: WebContentState) => void): () => void {
    const view = this.views.get(windowId);
    if (!view) return () => {};

    const wc = view.webContents;
    const fire = (): void => {
      cb({
        url: wc.getURL(),
        title: wc.getTitle(),
        isLoading: wc.isLoading(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward()
      });
    };
    type WcEvent =
      | 'did-start-loading'
      | 'did-stop-loading'
      | 'did-finish-load'
      | 'did-fail-load'
      | 'did-navigate'
      | 'did-navigate-in-page'
      | 'page-title-updated';
    const events: WcEvent[] = [
      'did-start-loading',
      'did-stop-loading',
      'did-finish-load',
      'did-fail-load',
      'did-navigate',
      'did-navigate-in-page',
      'page-title-updated'
    ];
    events.forEach((e) => {
      // The listener fires for each event name with different payloads; we only read URL/title.
      (wc.on as unknown as (ev: WcEvent, cb: () => void) => void)(e, fire);
    });
    return () => {
      events.forEach((e) => {
        try {
          (wc.removeListener as unknown as (ev: WcEvent, cb: () => void) => void)(e, fire);
        } catch { /* noop */ }
      });
    };
  }

  private getUrlForAppType(appType: AppType): string {
    switch (appType) {
      case 'youtube':
        return 'https://www.youtube.com/';
      case 'browser':
        return 'https://www.google.com/';
      // Future: other web-based apps
      default:
        throw new Error(`No URL configured for app type: ${appType}`);
    }
  }
}

// Singleton instance
let instance: WebContentManager | null = null;

export function getWebContentManager(): WebContentManager {
  if (!instance) {
    instance = new WebContentManager();
  }
  return instance;
}
