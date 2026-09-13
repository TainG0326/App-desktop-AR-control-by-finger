import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { GestureState } from '@renderer/gestures/stateMachine.js';
import type { GestureEvent } from '@renderer/gestures/stateMachine.js';
import type { PinchState } from '@renderer/gestures/PinchDetector.js';

/** Phase of the 5-finger zoom detector. Re-exported here for store consumers. */
export type ZoomPhase = 'IDLE' | 'TRACKING' | 'COOLDOWN';

/**
 * Gesture store — single source of truth for interaction state.
 * Components subscribe to this; high-frequency reads should use refs.
 */
interface GestureStore {
  fsmState: GestureState;
  pinchState: PinchState;
  pinchDistanceNorm: number;
  /** Current pinch zoom factor (1.0 = no zoom). Only updates while ZOOMING. */
  zoomFactor: number;
  /** ID of the window currently targeted by zoom gesture (topmost focused at zoom start). */
  zoomTargetWindowId: string | null;
  /** True when hold-drag mode is armed (cursor should show grab icon). */
  holdDragArmed: boolean;
  /** Current phase of the 5-finger zoom detector — used by debug overlay. */
  zoomPhase: ZoomPhase;
  /** How many fingertips (0..5) of the 5-finger zoom gesture moved outward since baseline. */
  zoomMovedOutward: number;
  /** How many fingertips (0..5) of the 5-finger zoom gesture moved inward since baseline. */
  zoomMovedInward: number;
  /** Recent gesture events (capped) */
  events: GestureEvent[];
  setFsmState(s: GestureState): void;
  setPinchState(s: PinchState): void;
  setPinchDistance(d: number): void;
  setZoomFactor(f: number, windowId: string | null): void;
  setHoldDragArmed(b: boolean): void;
  setZoomPhase(p: ZoomPhase, outward: number, inward: number): void;
  pushEvent(e: GestureEvent): void;
}

export const useGestureStore = create<GestureStore>()(
  subscribeWithSelector((set) => ({
    fsmState: 'IDLE',
    pinchState: 'OPEN',
    pinchDistanceNorm: 0,
    zoomFactor: 1.0,
    zoomTargetWindowId: null,
    holdDragArmed: false,
    zoomPhase: 'IDLE',
    zoomMovedOutward: 0,
    zoomMovedInward: 0,
    events: [],
    setFsmState: (fsmState) => set({ fsmState }),
    setPinchState: (pinchState) => set({ pinchState }),
    setPinchDistance: (pinchDistanceNorm) => set({ pinchDistanceNorm }),
    setZoomFactor: (zoomFactor, zoomTargetWindowId) => set({ zoomFactor, zoomTargetWindowId }),
    setHoldDragArmed: (holdDragArmed) => set({ holdDragArmed }),
    setZoomPhase: (zoomPhase, zoomMovedOutward, zoomMovedInward) =>
      set({ zoomPhase, zoomMovedOutward, zoomMovedInward }),
    pushEvent: (e) =>
      set((s) => ({ events: [e, ...s.events].slice(0, 32) }))
  }))
);
