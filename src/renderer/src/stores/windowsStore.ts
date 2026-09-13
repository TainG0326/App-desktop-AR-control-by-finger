import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WindowDescriptor, AppType } from '@shared/types/index.js';

export interface AppSpec {
  type: AppType;
  title: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
}

const APP_SPECS: Record<AppType, AppSpec> = {
  youtube: {
    type: 'youtube',
    title: 'YouTube',
    defaultWidth: 1400,
    defaultHeight: 800,
    minWidth: 800,
    minHeight: 500
  },
  browser: {
    type: 'browser',
    title: 'Trình duyệt',
    defaultWidth: 1280,
    defaultHeight: 800,
    minWidth: 720,
    minHeight: 480
  },
  notes: { 
    type: 'notes', 
    title: 'Notes', 
    defaultWidth: 600, 
    defaultHeight: 700, 
    minWidth: 400, 
    minHeight: 300 
  },
  drawing: { 
    type: 'drawing', 
    title: 'Drawing', 
    defaultWidth: 900, 
    defaultHeight: 700, 
    minWidth: 600, 
    minHeight: 400 
  },
  settings: { 
    type: 'settings', 
    title: 'Settings', 
    defaultWidth: 600, 
    defaultHeight: 700, 
    minWidth: 520, 
    minHeight: 600 
  },
  clock: { 
    type: 'clock', 
    title: 'Clock', 
    defaultWidth: 400, 
    defaultHeight: 400, 
    minWidth: 320, 
    minHeight: 320 
  },
  gallery: { 
    type: 'gallery', 
    title: 'Gallery', 
    defaultWidth: 1000, 
    defaultHeight: 700, 
    minWidth: 600, 
    minHeight: 400 
  }
};

interface WindowStore {
  windows: Record<string, WindowDescriptor>;
  order: string[]; // back-to-front
  focusedId: string | null;
  nextZ: number;
  open(spec: Partial<AppSpec> & { type: AppType; x?: number; y?: number }): string;
  close(id: string): void;
  focus(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, width: number, height: number): void;
  minimize(id: string): void;
  restore(id: string): void;
  maximize(id: string): void;
  unmaximize(id: string): void;
  toggleMaximize(id: string): void;
  setScale(id: string, scale: number, min: number, max: number): void;
  resetScale(id: string): void;
  layoutSnapshot(): { windows: WindowDescriptor[]; focusedId: string | null };
  restoreFromSnapshot(snap: { windows: WindowDescriptor[]; focusedId: string | null }): void;
}

const PERSISTED_KEY = 'airvision-window-layout-v1';

function clampToViewport(w: WindowDescriptor): WindowDescriptor {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const headerHeight = 130;
  const minVisible = 80;
  const x = Math.max(-(w.width - minVisible), Math.min(w.x, vw - minVisible));
  const y = Math.max(headerHeight, Math.min(w.y, vh - 40));
  return { ...w, x, y };
}

export const useWindowStore = create<WindowStore>()(
  subscribeWithSelector((set, get) => ({
    windows: {},
    order: [],
    focusedId: null,
    nextZ: 1,

    open(spec) {
      const full = { ...APP_SPECS[spec.type], ...spec };
      const id = `${full.type}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
      const offset = (get().order.length % 6) * 28;
      
      // Position below header (120px min from top)
      const headerHeight = 120;
      const x = spec.x ?? Math.max(40, Math.floor((vw - full.defaultWidth) / 2) + offset);
      const y = spec.y ?? Math.max(headerHeight, Math.floor((vh - full.defaultHeight) / 2) + offset);
      const z = get().nextZ + 1;
      
      // Determine if app uses native web content
      const hasNativeContent = full.type === 'youtube' || full.type === 'browser';
      
      const w: WindowDescriptor = {
        id,
        appType: full.type,
        title: full.title,
        x,
        y,
        width: full.defaultWidth,
        height: full.defaultHeight,
        minWidth: full.minWidth,
        minHeight: full.minHeight,
        zIndex: z,
        isActive: true,
        isMinimized: false,
        isMaximized: false,
        previousBounds: null,
        hasNativeContent,
        scale: 1.0
      };
      set((s) => ({
        windows: { ...s.windows, [id]: w },
        order: [...s.order, id],
        focusedId: id,
        nextZ: z
      }));
      void window.api?.windows.saveLayout(get().layoutSnapshot());
      return id;
    },

    close(id) {
      set((s) => {
        const { [id]: _gone, ...rest } = s.windows;
        const order = s.order.filter((x) => x !== id);
        const newFocused = s.focusedId === id ? (order[order.length - 1] ?? null) : s.focusedId;
        return { windows: rest, order, focusedId: newFocused };
      });
      void window.api?.windows.saveLayout(get().layoutSnapshot());
    },

    focus(id) {
      const z = get().nextZ + 1;
      set((s) => {
        const w = s.windows[id];
        if (!w) return {};
        return {
          windows: { ...s.windows, [id]: { ...w, isActive: true, zIndex: z } },
          focusedId: id,
          nextZ: z
        };
      });
    },

    move(id, x, y) {
      set((s) => {
        const w = s.windows[id];
        if (!w) return {};
        const next = clampToViewport({ ...w, x, y });
        return { windows: { ...s.windows, [id]: next } };
      });
    },

    resize(id, width, height) {
      set((s) => {
        const w = s.windows[id];
        if (!w) return {};
        const w2 = Math.max(w.minWidth, width);
        const h2 = Math.max(w.minHeight, height);
        return { windows: { ...s.windows, [id]: { ...w, width: w2, height: h2 } } };
      });
    },

    minimize(id) {
      set((s) => {
        const w = s.windows[id];
        if (!w) return {};
        return { windows: { ...s.windows, [id]: { ...w, isMinimized: true } } };
      });
    },

    restore(id) {
      set((s) => {
        const w = s.windows[id];
        if (!w) return {};
        return { windows: { ...s.windows, [id]: { ...w, isMinimized: false } } };
      });
    },

    maximize(id) {
      set((s) => {
        const w = s.windows[id];
        if (!w || w.isMaximized) return {};
        
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
        
        // Save current bounds for restore
        const previousBounds = { x: w.x, y: w.y, width: w.width, height: w.height };
        
        // Maximize to almost full viewport (leave space for dock)
        const maxBounds = {
          x: 20,
          y: 20,
          width: vw - 40,
          height: vh - 120 // leave space for dock at bottom
        };
        
        return {
          windows: {
            ...s.windows,
            [id]: { ...w, ...maxBounds, isMaximized: true, previousBounds }
          }
        };
      });
    },

    unmaximize(id) {
      set((s) => {
        const w = s.windows[id];
        if (!w || !w.isMaximized || !w.previousBounds) return {};
        
        return {
          windows: {
            ...s.windows,
            [id]: {
              ...w,
              x: w.previousBounds.x,
              y: w.previousBounds.y,
              width: w.previousBounds.width,
              height: w.previousBounds.height,
              isMaximized: false,
              previousBounds: null
            }
          }
        };
      });
    },

    toggleMaximize(id) {
      const w = get().windows[id];
      if (!w) return;
      if (w.isMaximized) {
        get().unmaximize(id);
      } else {
        get().maximize(id);
      }
    },

    setScale(id, scale, min, max) {
      const clamped = Math.max(min, Math.min(max, scale));
      set((s) => {
        const w = s.windows[id];
        if (!w) return {};
        return { windows: { ...s.windows, [id]: { ...w, scale: clamped } } };
      });
    },

    resetScale(id) {
      set((s) => {
        const w = s.windows[id];
        if (!w) return {};
        return { windows: { ...s.windows, [id]: { ...w, scale: 1.0 } } };
      });
    },

    layoutSnapshot() {
      const s = get();
      return {
        windows: s.order.map((id) => s.windows[id]).filter(Boolean),
        focusedId: s.focusedId
      };
    },

    restoreFromSnapshot(snap) {
      const windows: Record<string, WindowDescriptor> = {};
      const order: string[] = [];
      let nextZ = 1;
      for (const w of snap.windows) {
        windows[w.id] = clampToViewport(w);
        order.push(w.id);
        if (w.zIndex > nextZ) nextZ = w.zIndex;
      }
      set({ windows, order, focusedId: snap.focusedId, nextZ });
    }
  }))
);

export const APP_REGISTRY = APP_SPECS;
export const LAYOUT_STORAGE_KEY = PERSISTED_KEY;