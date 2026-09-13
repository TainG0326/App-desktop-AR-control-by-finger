import { useEffect } from 'react';
import { getHandTracker } from './useHandTracking.js';

/**
 * Wires the HandTracker to the camera <video> element (identified by
 * `data-camera-feed`). Starts tracking when the video is available and
 * the camera is streaming.
 */
export function HandTrackingBridge(): null {
  useEffect(() => {
    const tracker = getHandTracker();
    let cancelled = false;
    let pollTimer: number | null = null;
    let stopTimer: number | null = null;

    void (async () => {
      try {
        await tracker.init();
      } catch {
        return;
      }
      if (cancelled) return;

      const tryStart = (): boolean => {
        if (cancelled) return true;
        if (tracker.getState().status === 'error') return true;
        const video = document.querySelector<HTMLVideoElement>('video[data-camera-feed]');
        if (video && video.readyState >= 2) {
          tracker.start(video);
          return true;
        }
        return false;
      };

      if (tryStart()) return;

      pollTimer = window.setInterval(() => {
        if (tryStart()) {
          if (pollTimer !== null) window.clearInterval(pollTimer);
          if (stopTimer !== null) window.clearTimeout(stopTimer);
        }
      }, 500);
      stopTimer = window.setTimeout(() => {
        if (pollTimer !== null) window.clearInterval(pollTimer);
      }, 30_000);
    })();

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (stopTimer !== null) window.clearTimeout(stopTimer);
      tracker.stop();
    };
  }, []);

  return null;
}