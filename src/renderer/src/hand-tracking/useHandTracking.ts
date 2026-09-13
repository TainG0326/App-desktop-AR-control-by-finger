import { useSyncExternalStore } from 'react';
import { HandTracker } from './HandTracker.js';
import type { HandFrame, TrackerState } from './types.js';

let _tracker: HandTracker | null = null;
export function getHandTracker(): HandTracker {
  if (!_tracker) _tracker = new HandTracker();
  return _tracker;
}

export function useTrackerState<T = TrackerState>(selector: (s: TrackerState) => T = (s) => s as unknown as T): T {
  const tracker = getHandTracker();
  return useSyncExternalStore(
    tracker.onState.bind(tracker),
    () => selector(tracker.getState()),
    () => selector(tracker.getState())
  );
}

export function useHandFrame(): HandFrame | null {
  return useTrackerState((s) => s.lastFrame);
}