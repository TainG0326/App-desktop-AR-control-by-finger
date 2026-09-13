import { LANDMARK, type TrackedHand } from '@renderer/hand-tracking/types.js';
import { palmSize } from '@renderer/interaction/landmarkNormalizer.js';

/**
 * Pinch state — pure data describing how close the thumb and index are.
 */
export type PinchState = 'OPEN' | 'PINCH_START' | 'PINCH_HOLD' | 'PINCH_RELEASE';

export interface PinchDetectorOptions {
  /** Sensitivity 0..1; lower = stricter (start threshold lower, release threshold lower too) */
  sensitivity?: number;
  /** Min confidence to consider a hand */
  minConfidence?: number;
}

interface PinchThresholds {
  /** Normalized distance below which we enter PINCH_START. */
  start: number;
  /** Normalized distance above which we exit PINCH_HOLD. */
  release: number;
}

/**
 * Default thresholds (LOCKED in docs/GESTURE_SPEC.md):
 *   start = 0.35, release = 0.55
 * Sensitivity 0.5 keeps them at defaults.
 *   sensitivity 0.0 (more lenient) → start=0.45, release=0.65
 *   sensitivity 1.0 (stricter)    → start=0.25, release=0.45
 */
export const PINCH_THRESHOLDS: PinchThresholds = {
  start: 0.35,
  release: 0.55
};

export class PinchDetector {
  private sensitivity: number;
  private minConfidence: number;
  private state: PinchState = 'OPEN';
  /** Frame count where state has remained stable (for debouncing) */
  private holdFrames = 0;
  /** Last computed normalized distance (for debug) */
  private lastDistanceNorm = 0;
  /** Wall-clock ms when we first entered PINCH_HOLD (for hold-duration tracking). */
  private holdStartMs: number | null = null;
  /** Previous frame's normalized distance; used to detect dynamic pinch for zoom. */
  private previousNorm = 0;

  constructor(opts: PinchDetectorOptions = {}) {
    this.sensitivity = opts.sensitivity ?? 0.5;
    this.minConfidence = opts.minConfidence ?? 0.5;
  }

  setSensitivity(v: number): void {
    this.sensitivity = Math.max(0, Math.min(1, v));
  }

  getState(): PinchState {
    return this.state;
  }

  getLastDistanceNorm(): number {
    return this.lastDistanceNorm;
  }

  /**
   * How many ms the user has been continuously holding at minimum pinch distance.
   * Returns 0 when not in PINCH_HOLD. Use `tMs` to track time across frames.
   */
  getHoldDuration(tMs: number): number {
    if (this.state !== 'PINCH_HOLD' || this.holdStartMs === null) return 0;
    return Math.max(0, tMs - this.holdStartMs);
  }

  /**
   * Reset the hold timer (called when entering/exiting PINCH_HOLD).
   */
  resetHold(): void {
    this.holdStartMs = null;
  }

  /**
   * True if the user is at (or very close to) the minimum pinch distance.
   * `jitter` buffers small hand-jitter variance so a perfectly held pinch counts as stable.
   */
  isAtMinimumDistance(d: number, jitter = 0.02): boolean {
    const { start } = this.currentThresholds();
    return d <= start + jitter;
  }

  /**
   * True if the pinch is currently "dynamic" — the normalized distance is changing
   * frame-over-frame (zoom intent). The raw signal is checked, not the smoothed one,
   * so hand jitter doesn't trigger false zoom signals.
   */
  isDynamic(delta = 0.04): boolean {
    if (this.state !== 'PINCH_HOLD') return false;
    const rawDelta = Math.abs(this.lastDistanceNorm - this.previousNorm);
    return rawDelta >= delta;
  }

  /**
   * Compute the normalized thumb-index distance for a hand.
   * Returns 0 if landmarks are missing.
   */
  static distanceNorm(hand: TrackedHand): number {
    const thumb = hand.landmarks[LANDMARK.THUMB_TIP];
    const index = hand.landmarks[LANDMARK.INDEX_TIP];
    if (!thumb || !index) return 0;
    const dx = thumb.x - index.x;
    const dy = thumb.y - index.y;
    const dz = (thumb.z ?? 0) - (index.z ?? 0);
    const raw = Math.hypot(dx, dy, dz);
    return raw / palmSize(hand);
  }

  /**
   * Update the detector with the current frame.
   * Returns the new pinch state, normalized distance, and hold duration (ms).
   */
  update(hand: TrackedHand | null, tMs = 0): { state: PinchState; distanceNorm: number; holdMs: number } {
    if (!hand || hand.score < this.minConfidence) {
      this.state = 'OPEN';
      this.holdFrames = 0;
      this.lastDistanceNorm = 0;
      this.previousNorm = 0;
      this.holdStartMs = null;
      return { state: this.state, distanceNorm: 0, holdMs: 0 };
    }

    // Snapshot the previous frame's norm before overwriting for this frame.
    this.previousNorm = this.lastDistanceNorm;

    const d = PinchDetector.distanceNorm(hand);
    this.lastDistanceNorm = d;
    const { start, release } = this.currentThresholds();

    const prevState = this.state;
    switch (this.state) {
      case 'OPEN':
      case 'PINCH_RELEASE':
        if (d < start) {
          this.state = 'PINCH_START';
          this.holdFrames = 1;
        }
        break;
      case 'PINCH_START':
        if (d > release) {
          this.state = 'PINCH_RELEASE';
          this.holdFrames = 0;
        } else {
          this.holdFrames += 1;
          if (this.holdFrames >= 2) this.state = 'PINCH_HOLD';
        }
        break;
      case 'PINCH_HOLD':
        if (d > release) {
          this.state = 'PINCH_RELEASE';
          this.holdFrames = 0;
        }
        break;
    }

    // Track hold-start timestamp: set on first frame entering PINCH_HOLD, clear on exit.
    if (prevState !== 'PINCH_HOLD' && this.state === 'PINCH_HOLD') {
      this.holdStartMs = tMs;
    } else if (prevState === 'PINCH_HOLD' && this.state !== 'PINCH_HOLD') {
      this.holdStartMs = null;
    }

    return {
      state: this.state,
      distanceNorm: d,
      holdMs: this.getHoldDuration(tMs)
    };
  }

  private currentThresholds(): PinchThresholds {
    // Sensitivity 0..1 shifts both thresholds symmetrically.
    // At sensitivity=0.5 -> default.
    const offset = (this.sensitivity - 0.5) * 0.2;
    return {
      start: PINCH_THRESHOLDS.start + offset,
      release: PINCH_THRESHOLDS.release + offset
    };
  }
}