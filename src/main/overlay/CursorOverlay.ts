import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';

export interface CursorState {
  visible: boolean;
  x: number;
  y: number;
  showDwell: boolean;
  showHold: boolean;
  holdArmed: boolean;
  dwellColor: string;
  holdColor: string;
  zoomPhase: string;
  zoomDirection: string | null;
}

/**
 * Manages a transparent overlay BrowserWindow that renders the hand cursor
 * on top of everything — including Electron WebContentsView native views.
 *
 * Architecture:
 * - Created as a child of the main window with `parent: true`, so it
 *   always tracks the main window position/size.
 * - Frameless + transparent so only the cursor SVG is visible.
 * - `ignoreMouseEvents: true` so clicks pass through to the content below.
 * - The cursor DOM element is updated via IPC from the React SpatialCursor.
 */
export class CursorOverlay {
  private overlay: BrowserWindow;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;

    // Build preload path from app root
    const appRoot = app.getAppPath();
    const preloadPath = join(appRoot, 'out/preload/index.cjs');

    this.overlay = new BrowserWindow({
      width: mainWindow.getBounds().width,
      height: mainWindow.getBounds().height,
      x: mainWindow.getBounds().x,
      y: mainWindow.getBounds().y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      hasShadow: false,
      // Remove from parent so we can position it above the main window's WebContentsViews
      parent: undefined,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      }
    });

    // Ensure highest z-order. 'screen-saver' level is the highest on Windows.
    // On macOS use 'pop-up-menu', on Windows use 'screen-saver' for absolute top.
    this.overlay.setAlwaysOnTop(true, 'screen-saver');
    this.overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // Force z-order refresh after a short delay
    setTimeout(() => {
      if (!this.overlay.isDestroyed()) {
        this.overlay.moveTop();
      }
    }, 100);

    // Click-through: mouse events fall through to the window below.
    // IMPORTANT: Do NOT use { forward: true } here. Forwarding sends events
    // to mainWindow.webContents, but WebContentsViews are separate children
    // of contentView and won't receive those events. Instead, let events
    // pass through the transparent overlay to reach the main content directly.
    // Gesture events are injected via sendInputEvent() in WebContentInputDispatcher.
    this.overlay.setIgnoreMouseEvents(true);

    // Load the cursor overlay HTML from the renderer bundle.
    this.loadCursorHTML();

    // Keep overlay in sync with main window geometry.
    this.syncBounds();
    mainWindow.on('move', () => this.syncBounds());
    mainWindow.on('resize', () => this.syncBounds());

    // Hide cursor when the main window is not visible.
    mainWindow.on('hide', () => this.overlay.hide());
    mainWindow.on('show', () => this.overlay.show());

    // Debug label
    this.overlay.webContents.on('did-finish-load', () => {
      console.log('[CursorOverlay] Overlay loaded successfully');
      console.log('[CursorOverlay] Final URL:', this.overlay.webContents.getURL());
      // Show the overlay once it has content.
      this.syncBounds();
      this.overlay.show();
      // Force to top after showing
      setTimeout(() => {
        if (!this.overlay.isDestroyed()) {
          this.overlay.moveTop();
          console.log('[CursorOverlay] Forced to top z-order');
        }
      }, 200);
    });
    this.overlay.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[OverlayConsole wcid=${this.overlay.webContents.id}] [${level}] ${source}:${line} - ${message}`);
    });
    this.overlay.webContents.on('did-fail-load', (_ev, code, desc) => {
      console.error('[CursorOverlay] Failed to load:', code, desc);
    });
    this.overlay.webContents.on('did-navigate', (_e, url) => {
      console.log('[CursorOverlay] navigated to:', url);
    });
    this.overlay.webContents.on('dom-ready', () => {
      console.log('[CursorOverlay] dom-ready, URL:', this.overlay.webContents.getURL());
    });
  }

  private loadCursorHTML(): void {
    const isDev = !app.isPackaged;
    
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      // Dev mode: load from Vite dev server (same as main window)
      const baseUrl = process.env['ELECTRON_RENDERER_URL'];
      const overlayUrl = `${baseUrl}/src/cursor-overlay/index.html`;
      console.log('[CursorOverlay] loading from dev server:', overlayUrl);
      void this.overlay.loadURL(overlayUrl);
    } else {
      // Production: load from built files
      const htmlPath = join(__dirname, '../../renderer/cursor-overlay.html');
      console.log('[CursorOverlay] loading from file:', htmlPath);
      void this.overlay.loadFile(htmlPath);
    }
  }

  private syncBounds(): void {
    const bounds = this.mainWindow.getBounds();
    // Use setBounds for synchronous repositioning.
    this.overlay.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    });
  }

  /** Push cursor state from main process → overlay renderer. */
  updateCursor(state: CursorState): void {
    if (this.overlay.isDestroyed()) return;
    try {
      this.overlay.webContents.send('cursor:update', state);
    } catch {
      // Best-effort: overlay may be loading.
    }
  }

  /** Show the overlay window. Called after first load. */
  show(): void {
    this.syncBounds();
    this.overlay.show();
    this.overlay.moveTop();
    console.log('[CursorOverlay] show() called, forced to top');
  }

  /** Destroy the overlay. */
  destroy(): void {
    this.overlay.destroy();
  }
}

// Singleton
let instance: CursorOverlay | null = null;

export function createCursorOverlay(mainWindow: BrowserWindow): CursorOverlay {
  if (instance) instance.destroy();
  instance = new CursorOverlay(mainWindow);
  return instance;
}

export function getCursorOverlay(): CursorOverlay | null {
  return instance;
}
