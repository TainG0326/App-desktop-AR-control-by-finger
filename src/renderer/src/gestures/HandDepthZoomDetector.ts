import type { TrackedHand, NormalizedLandmark } from '@renderer/hand-tracking/types.js';
import { palmSize } from '@renderer/interaction/landmarkNormalizer.js';

/**
 * Continuous depth-based zoom. The user's hand does not need to be in
 * any specific pose — as long as it is visible (and the user is NOT
 * pinching for drag), this detector maps palm depth to a window scale.
 *
 * Mental model (matches the user's request):
 *   - "tay càng ra xa thì càng nhỏ dần theo"
 *     (the further the hand, the smaller the window)
 *   - "càng gần thì sẽ to dần lên"
 *     (the closer, the larger)
 *   - "khả thi và ổn định và mượt mà, tránh nhảy tùm lum"
 *     (smooth, stable, no jumping)
 *
 * How it works:
 *   baselineDepth is captured ONCE when the hand first stabilizes in
 *     front of the camera. baselineScale is the window scale at that
 *     moment — captured so the transition from "no zoom" to "active
 *     zoom" is seamless and continuous, never a snap.
 *   Each subsequent frame:
 *     ratio = smoothed_palm_size / baselineDepth
 *     target_scale = baselineScale × ratio    (clamped to zoomMin/Max)
 *     applied_scale is then EMA-smoothed from frame to frame.
 *
 *   The applied scale is what the engine writes to the window store.
 *
 * Why we use ratio (not absolute pixels):
 *   - Adapts to user's working distance. A person with their hand
 *     30cm away gets the same feel as one with their hand 60cm away.
 *   - Robust to camera FOV / resolution differences.
 *
 * Stability guards (the "tránh nhảy tùm lum" requirement):
 *   1. Heavy EMA on depth (α=0.18): absorbs MediaPipe jitter without
 *      being too laggy.
 *   2. Dead zone of ±5% around baseline ratio: when the hand is at
 *      rest, ratio noise ±3% does NOT cause zoom micro-jitter.
 *   3. Heavy EMA on scale (α=0.12): the final scale is buttery-smooth.
 *   4. Per-frame scale-change limit (±8%): even if the user waves
 *      their hand through the full range, the window cannot visibly
 *      jump faster than the user can visually follow.
 *   5. Baseline lock is one-shot: once captured, it does not drift.
 *      So the user's "neutral" never erodes while they're zooming.
 *
 * Drag suppression:
 *   The detector accepts a pinch-state hint. While the user is
 *   actively pinching (drag in progress), we FREEZE the applied scale
 *   at the current window scale and return null. This satisfies the
 *   "tay chụm sẽ chỉ only là drag" requirement — when the user closes
 *   their fingers to drag, zoom does nothing; when they release, zoom
 *   picks up exactly where it left off.
 *
 * Hand-lost handling:
 *   When the hand disappears briefly (MediaPipe dropouts), the
 *   applied scale is HELD. We do NOT snap back to baselineScale —
 *   that would cause the window to visibly jump when tracking
 *   recovers. The applied scale just stays where it was.
 */
export class HandDepthZoomDetector {
  /** Baseline palm size, captured once after the hand stabilizes. */
  private baselineDepth = 0;
  /** Window scale at the moment baselineDepth was captured. */
  private baselineScale = 1.0;
  /** True once baselineDepth + baselineScale have been locked in. */
  private baselineLocked = false;
  /** EMA of recent palm sizes. */
  private smoothedDepth = 0;
  /** The scale the last frame returned (= what's currently applied to the window). */
  private appliedScale = 1.0;
  /** Previous frame's raw depth (used during stability check). */
  private prevDepth = 0;
  /** Consecutive frames the hand has been stable enough to lock baseline. */
  private stableFrames = 0;
  /** Number of consecutive frames with valid hand data. Resets to 0 on dropout. */
  private validFrames = 0;
  /** True while the user is pinching — used to freeze zoom updates. */
  private dragInProgress = false;

  constructor(private readonly opts: {
    /** EMA alpha for palm-size smoothing. Lower = smoother but laggier. */
    depthAlpha: number;
    /** EMA alpha for applied-scale smoothing. Lower = smoother. */
    scaleAlpha: number;
    /** Ratio deviation from 1.0 within which NO zoom change occurs. */
    deadZone: number;
    /** Per-frame maximum scale change, as fraction of current scale. */
    maxScaleChangePerFrame: number;
    /** Consecutive frames the hand must be stable before baseline is captured. */
    baselineStableFrames: number;
    /** Per-frame depth movement (as fraction of smoothed depth) considered "stable". */
    stabilityMovement: number;
    /** Minimum required detection confidence. */
    minHandConfidence: number;
  }) {}

  /**
   * Compute the next scale to apply.
   *
   * @param hand            The primary hand this frame, or null if no hand.
   * @param isPinching      True if the user is currently pinching (drag in progress).
   * @param tMs             Wall-clock timestamp (ms).
   * @param currentScale    The window's current scale, read from the store.
   * @param scaleMin        Lower clamp for output scale.
   * @param scaleMax        Upper clamp for output scale.
   * @returns               The new scale to apply, or null if nothing should change this frame.
   */
  update(
    hand: TrackedHand | null,
    isPinching: boolean,
    tMs: number,
    currentScale: number,
    scaleMin: number,
    scaleMax: number
  ): number | null {
    // 0) Hand lost — hold the current scale frozen. Do NOT snap back.
    if (!hand || hand.score < this.opts.minHandConfidence) {
      this.validFrames = 0;
      this.stableFrames = 0;
      this.appliedScale = currentScale; // resync to whatever the store has
      this.dragInProgress = isPinching;
      return null;
    }

    this.validFrames++;
    this.dragInProgress = isPinching;

    const size = palmSize(hand);
    if (size <= 0) return null;

    // 1) Initialize / update the smoothed depth EMA.
    if (this.smoothedDepth === 0) {
      this.smoothedDepth = size;
    } else {
      this.smoothedDepth =
        this.smoothedDepth * (1 - this.opts.depthAlpha) + size * this.opts.depthAlpha;
    }

    // 2) Stability check (used only for baseline capture).
    const movement =
      this.smoothedDepth > 0
        ? Math.abs(size - this.prevDepth) / this.smoothedDepth
        : 0;
    if (movement <= this.opts.stabilityMovement) {
      this.stableFrames++;
    } else {
      this.stableFrames = 0;
    }
    this.prevDepth = size;

    // 3) Capture baseline on first stable window. After this point the
    //    baseline NEVER drifts — the user's chosen neutral position
    //    is preserved across the whole session.
    if (!this.baselineLocked) {
      // First valid frame: seed previous depth without counting toward stability.
      if (this.validFrames < 2) return null;
      if (this.stableFrames < this.opts.baselineStableFrames) return null;

      this.baselineDepth = this.smoothedDepth;
      // baselineScale = the scale the window already has. We do NOT
      // reset to 1.0 — that would force every zoom interaction to
      // start from 100% regardless of where the user was before.
      this.baselineScale = currentScale;
      this.baselineLocked = true;
      this.appliedScale = currentScale;

      // eslint-disable-next-line no-console
      console.log(
        `[HandDepthZoom] baseline locked: depth=${this.baselineDepth.toFixed(4)} ` +
        `windowScale=${(this.baselineScale * 100).toFixed(0)}% ` +
        `min=${scaleMin} max=${scaleMax}`
      );
      return null;
    }

    // 4) Drag suppression: while user is pinching for drag, freeze zoom.
    //    We re-sync appliedScale to the current window scale so that
    //    if anything else changes scale (e.g., user pressed "reset"),
    //    we still pick up correctly when the pinch ends.
    if (isPinching) {
      this.appliedScale = currentScale;
      return null;
    }

    // 5) Compute ratio and apply the dead zone.
    let ratio = this.smoothedDepth / this.baselineDepth;
    const deviation = ratio - 1;
    if (Math.abs(deviation) < this.opts.deadZone) {
      ratio = 1.0;
    }

    // 6) Compute target scale (the "ideal" value the user is asking for).
    const targetScale = clamp(this.baselineScale * ratio, scaleMin, scaleMax);

    // 7) EMA the applied scale toward target. This is the workhorse
    //    for smoothness — heavy alpha on the output means even a
    //    step change in target produces a gentle glide.
    let next = this.appliedScale + (targetScale - this.appliedScale) * this.opts.scaleAlpha;
    next = clamp(next, scaleMin, scaleMax);

    // 8) Per-frame change limiter: nothing can move more than ±X% in
    //    one frame, even if the user flings their hand. This is a
    //    belt-and-suspenders guard for the "tránh nhảy tùm lum"
    //    requirement: a sudden glitch in MediaPipe depth cannot make
    //    the window visually jump.
    const maxDelta = this.appliedScale * this.opts.maxScaleChangePerFrame;
    if (next > this.appliedScale + maxDelta) next = this.appliedScale + maxDelta;
    if (next < this.appliedScale - maxDelta) next = this.appliedScale - maxDelta;
    next = clamp(next, scaleMin, scaleMax);

    // 9) Skip the write if the change is below store-update threshold.
    //    setScale in the store already de-noises by exact-equality, but
    //    doing it here saves a React render per frame at rest.
    if (Math.abs(next - currentScale) < 0.001) {
      this.appliedScale = currentScale;
      return null;
    }

    this.appliedScale = next;
    return next;
  }

  /**
   * Notify the detector that the user has reset the window scale
   * (e.g., pressed the reset button). After reset, the next "stable"
   * baseline is re-captured at the new scale. Until then, the applied
   * scale tracks whatever the window has.
   */
  onScaleReset(): void {
    // Re-lock baseline at next stable window so the user's "neutral"
    // matches where the window currently is.
    this.baselineLocked = false;
    this.baselineDepth = 0;
    this.baselineScale = 1.0;
    this.appliedScale = 1.0;
    this.smoothedDepth = 0;
    this.stableFrames = 0;
    this.validFrames = 0;
    this.prevDepth = 0;
  }

  /** Reset detector state — used when hand tracking starts or restarts. */
  reset(): void {
    this.baselineDepth = 0;
    this.baselineScale = 1.0;
    this.baselineLocked = false;
    this.smoothedDepth = 0;
    this.appliedScale = 1.0;
    this.prevDepth = 0;
    this.stableFrames = 0;
    this.validFrames = 0;
    this.dragInProgress = false;
  }

  /** Diagnostic — for the debug overlay. */
  getDebugInfo(): {
    baselineLocked: boolean;
    baselineDepth: number;
    baselineScale: number;
    smoothedDepth: number;
    appliedScale: number;
    stableFrames: number;
    dragInProgress: boolean;
  } {
    return {
      baselineLocked: this.baselineLocked,
      baselineDepth: this.baselineDepth,
      baselineScale: this.baselineScale,
      smoothedDepth: this.smoothedDepth,
      appliedScale: this.appliedScale,
      stableFrames: this.stableFrames,
      dragInProgress: this.dragInProgress
    };
  }

  /** Diagnostic — current depth ratio (1.0 = at baseline). */
  getRatio(): number {
    if (!this.baselineLocked || this.baselineDepth <= 0) return 1.0;
    return this.smoothedDepth / this.baselineDepth;
  }
}

/**
 * Standard tuning. Values chosen for:
 *  - depthAlpha (0.18): ~5-frame lag at 30fps, enough to absorb
 *    MediaPipe landmark jitter without feeling sluggish.
 *  - scaleAlpha (0.12): ~8-frame lag, but with a fast depth signal
 *    the combined lag feels around 200ms — natural and responsive.
 *  - deadZone (0.02): ratio 0.98..1.02 = ±2% motion is neutral,
 *    prevents micro-jitter while keeping zoom responsive.
 *  - maxScaleChangePerFrame (0.08): ±8% per 33ms frame caps out
 *    at ~30% movement in the first 100ms even under extreme input.
 *  - baselineStableFrames (7) + stabilityMovement (0.022): hand
 *    must drift under 2.2% for 7 consecutive frames (~233ms at
 *    30fps). This prevents capturing a baseline during the
 *    transitional frames where the hand is still being lifted into
 *    position.
 */
export const HAND_DEPTH_ZOOM_CONFIG = {
  depthAlpha: 0.18,
  scaleAlpha: 0.12,
  deadZone: 0.02,
  maxScaleChangePerFrame: 0.08,
  baselineStableFrames: 7,
  stabilityMovement: 0.022,
  minHandConfidence: 0.6
};

export function createHandDepthZoomDetector(): HandDepthZoomDetector {
  return new HandDepthZoomDetector(HAND_DEPTH_ZOOM_CONFIG);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
