import { useGestureStore } from '@renderer/stores/gestureStore.js';
import type { GestureState, GestureEvent } from '@renderer/gestures/stateMachine.js';
import type { PinchState } from '@renderer/gestures/PinchDetector.js';

export interface GestureSnapshot {
  state: GestureState;
  pinchState: PinchState;
  pinchDistanceNorm: number;
  events: GestureEvent[];
}

export function useGestureSnapshot(): GestureSnapshot {
  return useGestureStore((s) => ({
    state: s.fsmState,
    pinchState: s.pinchState,
    pinchDistanceNorm: s.pinchDistanceNorm,
    events: s.events
  }));
}

export function useGestureState(): GestureState {
  return useGestureStore((s) => s.fsmState);
}