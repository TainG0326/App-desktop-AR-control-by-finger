import { ipcMain, shell, app, BrowserWindow } from 'electron';
import { SettingsService } from '../persistence/SettingsService.js';
import { LayoutService } from '../persistence/LayoutService.js';
import { getWebContentManager } from '../webview/WebContentManager.js';
import { getCursorOverlay } from '../overlay/CursorOverlay.js';
import type { AppType } from '@shared/types/index.js';

let settings: SettingsService | null = null;
let layout: LayoutService | null = null;

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Register all IPC handlers.
 * Notes persistence happens in the renderer via Dexie/IndexedDB
 * (the preload does not need to round-trip notes through main).
 */
export function registerIpcHandlers(): void {
  settings = new SettingsService();
  layout = new LayoutService();

  ipcMain.handle('settings:get', () => settings!.get());
  ipcMain.handle('settings:set', (_e, patch) => settings!.set(patch));
  ipcMain.handle('settings:reset', () => settings!.reset());

  ipcMain.handle('windows:layout:save', (_e, data) => layout!.save(data));
  ipcMain.handle('windows:layout:load', () => layout!.load());

  // WebContentsView management
  ipcMain.handle('webview:create', (_e, windowId: string, appType: AppType, bounds: Rectangle, extraTopOffset?: number) => {
    const manager = getWebContentManager();
    return manager.create({ windowId, appType, bounds, extraTopOffset });
  });

  ipcMain.handle('webview:update-bounds', (_e, windowId: string, bounds: Rectangle) => {
    const manager = getWebContentManager();
    manager.updateBounds(windowId, bounds);
  });

  ipcMain.handle('webview:set-visible', (_e, windowId: string, visible: boolean) => {
    const manager = getWebContentManager();
    manager.setVisible(windowId, visible);
  });

  ipcMain.handle('webview:destroy', (_e, windowId: string) => {
    const manager = getWebContentManager();
    manager.destroy(windowId);
  });

  // Hand input → WebContents
  ipcMain.handle('webview:input', (_e, windowId: string, rawEvent: unknown) => {
    const VALID_TYPES = ['mouseMove', 'mouseDown', 'mouseUp', 'mouseWheel'] as const;
    if (
      typeof rawEvent !== 'object' ||
      rawEvent === null ||
      !('type' in rawEvent) ||
      typeof (rawEvent as { type: unknown }).type !== 'string' ||
      !(VALID_TYPES as readonly string[]).includes((rawEvent as { type: string }).type)
    ) {
      console.warn('[IPC] webview:input received invalid event type', rawEvent);
      return false;
    }

    const evt = rawEvent as {
      type: 'mouseMove' | 'mouseDown' | 'mouseUp' | 'mouseWheel';
      x?: number;
      y?: number;
      button?: string;
      clickCount?: number;
      deltaX?: number;
      deltaY?: number;
      wheelTicks?: number;
      buttons?: string[];
    };

    // Validate coordinates.
    if (typeof evt.x !== 'number' || typeof evt.y !== 'number') {
      return false;
    }

    const manager = getWebContentManager();
    return manager.injectInput(windowId, {
      type: evt.type,
      x: evt.x,
      y: evt.y,
      button: evt.button as 'left' | 'right' | 'middle',
      clickCount: evt.clickCount,
      deltaX: evt.deltaX,
      deltaY: evt.deltaY,
      wheelTicks: evt.wheelTicks,
      buttons: evt.buttons as ('left' | 'right' | 'middle')[]
    });
  });

  // Hand keyboard → WebContents
  ipcMain.handle('webview:key', (_e, windowId: string, rawEvent: unknown) => {
    const VALID_KEY_TYPES = ['keyDown', 'keyUp', 'char'] as const;
    if (
      typeof rawEvent !== 'object' ||
      rawEvent === null ||
      !('type' in rawEvent) ||
      typeof (rawEvent as { type: unknown }).type !== 'string' ||
      !(VALID_KEY_TYPES as readonly string[]).includes((rawEvent as { type: string }).type) ||
      typeof (rawEvent as { key?: unknown }).key !== 'string'
    ) {
      console.warn('[IPC] webview:key received invalid event', rawEvent);
      return false;
    }

    const evt = rawEvent as {
      type: 'keyDown' | 'keyUp' | 'char';
      key: string;
      code?: string;
      modifiers?: ('shift' | 'control' | 'alt' | 'meta')[];
    };

    const manager = getWebContentManager();
    return manager.injectKey(windowId, {
      type: evt.type,
      key: evt.key,
      code: evt.code,
      modifiers: evt.modifiers
    });
  });

  // Navigation
  ipcMain.handle('webview:navigate', (_e, windowId: string, url: string) => {
    const manager = getWebContentManager();
    return manager.navigate(windowId, url);
  });
  ipcMain.handle('webview:back', (_e, windowId: string) => {
    getWebContentManager().back(windowId);
  });
  ipcMain.handle('webview:forward', (_e, windowId: string) => {
    getWebContentManager().forward(windowId);
  });
  ipcMain.handle('webview:reload', (_e, windowId: string) => {
    getWebContentManager().reload(windowId);
  });

  // State subscriptions (used by Browser chrome)
  ipcMain.handle('webview:get-state', (_e, windowId: string) => {
    return getWebContentManager().getState(windowId);
  });

  ipcMain.handle('shell:openExternal', (_e, url: unknown) => {
    if (typeof url !== 'string') return;
    if (!url.startsWith('https://')) return;
    return shell.openExternal(url);
  });

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);

  // Window controls
  ipcMain.handle('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    win?.minimize();
  });

  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    // CRITICAL: destroy all WebContentsViews BEFORE closing the window.
    // A view that is still loading (e.g. google.com hasn't finished) can
    // block the close call indefinitely. We always call close() even if
    // destroyAll throws, and we use a force-close timer to ensure the
    // window never hangs indefinitely.
    let destroyed = false;
    try {
      getWebContentManager().destroyAll();
      destroyed = true;
    } catch (err) {
      console.error('[IPC] destroyAll before close failed:', err);
    }
    // If destroyAll ran without throwing but the window still exists, close it.
    // If destroyAll threw, we still close — better a clean close than a hang.
    if (win && !win.isDestroyed()) {
      win.close();
    }
    // Safety net: force-terminate if close() doesn't take within 3 seconds.
    // This handles edge cases where a WebContentsView keeps the renderer process
    // alive (e.g. a stalled load preventing renderer-exit).
    void (async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));
      if (destroyed && win && !win.isDestroyed()) {
        try {
          win.destroy();
        } catch {
          // Best-effort: app may already be gone.
        }
      }
    })();
  });

  // Debug log channel — pipes renderer console output into the main process
  // terminal so we can verify user actions during development.
  ipcMain.on('debug:log', (_e, message: string) => {
    console.log(`[Renderer] ${message}`);
  });

  // ── Cursor overlay ────────────────────────────────────────────────
  // React sends cursor state → main process → overlay window renderer.
  ipcMain.on('cursor:state', (_e, state: unknown) => {
    const overlay = getCursorOverlay();
    if (!overlay) return;
    // Validate minimal shape before forwarding.
    if (
      state !== null &&
      typeof state === 'object' &&
      'visible' in (state as Record<string, unknown>)
    ) {
      overlay.updateCursor(state as Parameters<typeof overlay.updateCursor>[0]);
    }
  });
}

export function initializeWebContentManager(mainWindow?: BrowserWindow): void {
  const manager = getWebContentManager();
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (win) {
    manager.setMainWindow(win);
    console.log('[IPC] WebContentManager initialized with main window');
  } else {
    console.error('[IPC] Failed to initialize WebContentManager - no window found');
  }
}
