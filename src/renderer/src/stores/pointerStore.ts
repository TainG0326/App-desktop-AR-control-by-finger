import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Pointer state.
 *
 * Designed for two consumers:
 *
 * 1. The high-frequency visual cursor uses a ref-backed snapshot updated
 *    every frame by the PointerController — no React subscription.
 * 2. Hover hit-testing runs at ~30 Hz and updates a small throttled slice
 *    of this store, which UI components subscribe to.
 */
export interface PointerState {
  /** Last computed screen-space pointer position in pixels. */
  position: { x: number; y: number };
  /** Whether the pointer is currently visible (hand tracked). */
  visible: boolean;
  /** Confidence of the last tracked hand [0..1]. */
  confidence: number;
  /** Set of element ids under the cursor pointer. */
  hoverIds: string[];
  /** Topmost hover id, if any. */
  topHoverId: string | null;
}

interface PointerStore extends PointerState {
  setPosition(pos: { x: number; y: number }): void;
  setVisible(v: boolean): void;
  setConfidence(c: number): void;
  setHover(ids: string[], top: string | null): void;
  reset(): void;
}

const INITIAL: PointerState = {
  position: { x: -9999, y: -9999 },
  visible: false,
  confidence: 0,
  hoverIds: [],
  topHoverId: null
};

export const usePointerStore = create<PointerStore>()(
  subscribeWithSelector((set) => ({
    ...INITIAL,
    setPosition: (position) => set({ position }),
    setVisible: (visible) => set({ visible }),
    setConfidence: (confidence) => set({ confidence }),
    setHover: (hoverIds, topHoverId) => set({ hoverIds, topHoverId }),
    reset: () => set(INITIAL)
  }))
);

/**
 * Ref-backed snapshot for high-frequency reads (visual cursor).
 * The PointerController updates this directly without going through React state.
 */
export const pointerRef: PointerState = { ...INITIAL };