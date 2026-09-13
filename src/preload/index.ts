import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Settings, WindowLayout, AppType } from '@shared/types/index.js';

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
    set: (patch: Partial<Settings>) =>
      ipcRenderer.invoke('settings:set', patch) as Promise<Settings>,
    reset: () => ipcRenderer.invoke('settings:reset') as Promise<Settings>
  },
  windows: {
    saveLayout: (layout: WindowLayout) =>
      ipcRenderer.invoke('windows:layout:save', layout) as Promise<void>,
    loadLayout: () =>
      ipcRenderer.invoke('windows:layout:load') as Promise<WindowLayout | null>
  },
  webview: {
    create: (windowId: string, appType: AppType, bounds: Rectangle, extraTopOffset?: number) =>
      ipcRenderer.invoke('webview:create', windowId, appType, bounds, extraTopOffset) as Promise<string>,
    updateBounds: (windowId: string, bounds: Rectangle) =>
      ipcRenderer.invoke('webview:update-bounds', windowId, bounds) as Promise<void>,
    setVisible: (windowId: string, visible: boolean) =>
      ipcRenderer.invoke('webview:set-visible', windowId, visible) as Promise<void>,
    destroy: (windowId: string) =>
      ipcRenderer.invoke('webview:destroy', windowId) as Promise<void>,
    injectInput: (windowId: string, event: unknown) =>
      ipcRenderer.invoke('webview:input', windowId, event) as Promise<boolean>,
    injectKey: (windowId: string, event: unknown) =>
      ipcRenderer.invoke('webview:key', windowId, event) as Promise<boolean>,
    navigate: (windowId: string, url: string) =>
      ipcRenderer.invoke('webview:navigate', windowId, url) as Promise<boolean>,
    back: (windowId: string) =>
      ipcRenderer.invoke('webview:back', windowId) as Promise<void>,
    forward: (windowId: string) =>
      ipcRenderer.invoke('webview:forward', windowId) as Promise<void>,
    reload: (windowId: string) =>
      ipcRenderer.invoke('webview:reload', windowId) as Promise<void>,
    getState: (windowId: string) =>
      ipcRenderer.invoke('webview:get-state', windowId) as Promise<{
        url: string;
        title: string;
        isLoading: boolean;
        canGoBack: boolean;
        canGoForward: boolean;
      }>
  },
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:openExternal', url) as Promise<void>
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
    getPlatform: () => ipcRenderer.invoke('app:platform') as Promise<NodeJS.Platform>
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
    maximize: () => ipcRenderer.invoke('window:maximize') as Promise<void>,
    close: () => ipcRenderer.invoke('window:close') as Promise<void>
  },
  // Cursor overlay: push state to the CursorOverlay BrowserWindow.
  // The overlay IPC channel is 'cursor:state' (ipcMain.on), so we use ipcRenderer.send.
  cursor: {
    sendState: (state: unknown) => ipcRenderer.send('cursor:state', state)
  },
  debug: {
    log: (message: string) => ipcRenderer.send('debug:log', message)
  }
};

contextBridge.exposeInMainWorld('api', api);

// ── Cursor overlay IPC ──────────────────────────────────────────────
// Receives cursor state pushed from main process → overlay renderer.
const cursorListeners = new Set<(state: unknown) => void>();
ipcRenderer.on('cursor:update', (_e: IpcRendererEvent, state: unknown) => {
  cursorListeners.forEach((cb) => cb(state));
});

// Expose to overlay renderer (same preload, but overlay uses this).
contextBridge.exposeInMainWorld('electronAPI', {
  onCursorUpdate: (cb: (state: unknown) => void) => {
    cursorListeners.add(cb);
    return () => cursorListeners.delete(cb);
  }
});

// Optional: allow main to push settings updates to renderer.
const settingsChangedListeners = new Set<(s: Settings) => void>();
ipcRenderer.on('settings:changed', (_e: IpcRendererEvent, settings: Settings) => {
  settingsChangedListeners.forEach((cb) => cb(settings));
});

export type AirVisionAPI = typeof api;
