import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Tool mode — what tool is currently active from the side toolbar.
 *  - 'none'     → no tool active
 *  - 'paint'    → overlay drawing canvas (full-screen)
 *  - 'keyboard' → virtual keyboard at bottom
 *  - 'browser'  → floating browser helper (back/forward/reload)
 *
 * Only one tool at a time — toggling a new tool disables the previous.
 */
export type ToolMode = 'none' | 'paint' | 'keyboard' | 'browser';

interface ToolStore {
  activeTool: ToolMode;

  /** Color palette index for paint tool. */
  paintColor: string;
  paintSize: number;

  /** Whether the virtual keyboard has shift pressed (shows uppercase / symbols). */
  keyboardShift: boolean;
  /** Whether the virtual keyboard is on the symbols/numbers layer. */
  keyboardSymbols: boolean;

  setTool(mode: ToolMode): void;
  toggleTool(mode: Exclude<ToolMode, 'none'>): void;
  setPaintColor(color: string): void;
  setPaintSize(size: number): void;
  setKeyboardShift(on: boolean): void;
  setKeyboardSymbols(on: boolean): void;

  /** Painting actions. */
  clearStrokes: () => void;
  /** Counter used to force re-render of canvas when strokes are committed. */
  strokesVersion: number;
  bumpStrokeVersion: () => void;
}

export const PAINT_COLORS = [
  '#ffffff',
  '#ffd76a',
  '#6cd28e',
  '#6aa9ff',
  '#b08cff',
  '#f08080',
  '#ff7a45',
  '#000000'
] as const;

export const useToolStore = create<ToolStore>()(
  subscribeWithSelector((set) => ({
    activeTool: 'none',
    paintColor: PAINT_COLORS[3] as string, // default blue
    paintSize: 6,
    keyboardShift: false,
    keyboardSymbols: false,
    strokesVersion: 0,
    bumpStrokeVersion: () => set((s) => ({ strokesVersion: s.strokesVersion + 1 })),
    clearStrokes: () => set((s) => ({ strokesVersion: s.strokesVersion + 1 })),
    setTool: (mode) => set({ activeTool: mode }),
    toggleTool: (mode) =>
      set((s) => ({ activeTool: s.activeTool === mode ? 'none' : mode })),
    setPaintColor: (color) => set({ paintColor: color }),
    setPaintSize: (size) => set({ paintSize: size }),
    setKeyboardShift: (on) => set({ keyboardShift: on }),
    setKeyboardSymbols: (on) =>
      set(() => ({ keyboardSymbols: on, keyboardShift: false }))
  }))
);
