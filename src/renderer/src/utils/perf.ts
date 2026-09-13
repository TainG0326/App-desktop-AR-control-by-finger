/**
 * Lightweight performance budget + measurement utilities.
 *
 * The application targets:
 *   - UI rendering: ~60 FPS where possible
 *   - Hand-tracking inference: ≥ 24 Hz on a typical 2020+ laptop
 *
 * To stay within budget we:
 *   - Throttle HandTracker inference to a configurable FPS (default 30).
 *   - Update the cursor visual from a requestAnimationFrame loop reading
 *     a ref-backed snapshot — no React re-render per frame.
 *   - Memoize heavy window components.
 *   - Cap `backdrop-filter` blur and surface count.
 */
export interface PerfSnapshot {
  /** Rolling average FPS over the last window of frames. */
  fps: number;
  /** Last frame's processing time in ms. */
  frameMs: number;
  /** Number of tracked windows. */
  windowCount: number;
  /** Total time since the app started. */
  uptimeMs: number;
}

const WINDOW = 60;
const times: number[] = [];

export function recordFrame(tMs: number): number {
  times.push(tMs);
  while (times.length > WINDOW) times.shift();
  if (times.length < 2) return 0;
  const span = times[times.length - 1] - times[0];
  return span > 0 ? ((times.length - 1) * 1000) / span : 0;
}