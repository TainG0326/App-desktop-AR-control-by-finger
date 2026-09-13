import type { Settings, WindowLayout, AppType } from '@shared/types/index.js';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Typed surface exposed by the preload via `contextBridge`.
 * This file is ambient — it is referenced from the renderer to type `window.api`.
 */
export interface AirVisionAPI {
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    reset(): Promise<Settings>;
  };
  windows: {
    saveLayout(layout: WindowLayout): Promise<void>;
    loadLayout(): Promise<WindowLayout | null>;
  };
  webview: {
    create(windowId: string, appType: AppType, bounds: Rectangle, extraTopOffset?: number): Promise<string>;
    updateBounds(windowId: string, bounds: Rectangle): Promise<void>;
    setVisible(windowId: string, visible: boolean): Promise<void>;
    destroy(windowId: string): Promise<void>;
    injectInput(windowId: string, event: unknown): Promise<boolean>;
    injectKey(windowId: string, event: { type: 'keyDown' | 'keyUp' | 'char'; key: string; code?: string; modifiers?: ('shift' | 'control' | 'alt' | 'meta')[] }): Promise<boolean>;
    navigate(windowId: string, url: string): Promise<boolean>;
    back(windowId: string): Promise<void>;
    forward(windowId: string): Promise<void>;
    reload(windowId: string): Promise<void>;
    getState(windowId: string): Promise<{
      url: string;
      title: string;
      isLoading: boolean;
      canGoBack: boolean;
      canGoForward: boolean;
    }>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<NodeJS.Platform>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
  };
  cursor: {
    sendState(state: unknown): void;
  };
  debug?: {
    log?(msg: string): void;
  };
}

declare global {
  interface Window {
    api: AirVisionAPI;
  }
}

export {};