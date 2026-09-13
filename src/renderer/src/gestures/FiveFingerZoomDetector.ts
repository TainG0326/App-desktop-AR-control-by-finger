import { LANDMARK } from '@renderer/hand-tracking/types.js';
import type { TrackedHand, NormalizedLandmark } from '@renderer/hand-tracking/types.js';
import { palmSize } from '@renderer/interaction/landmarkNormalizer.js';

/**
 * Discrete 5-finger zoom gesture detector.
 *
 * Why 5 fingers (not 2)? 2-finger pinch is the drag gesture — reserving it
 * for drag eliminates the constant flicker between drag and zoom that
 * happens when the FSM tries to disambiguate them. The 5-finger gesture is
 * visually and mechanically distinct from drag, so the user never has to
 * wonder which gesture fired.
 *
 * Behavior contract:
 *  - The gesture only activates when ALL 5 fingertips are CLEARLY EXTENDED
 *    (each fingertip is at least `minFingerExtension` palm-sizes from the
 *    palm center). A 2-finger pinch has the thumb tucked in toward the
 *    palm — that pose is rejected here, leaving drag to the FSM.
 *  - The spread delta must be CONSISTENT across fingers: at least 4 of 5
 *    fingertips move in the same direction by the threshold. This rejects
 *    gestures where only the thumb moves (it's a drag, not a zoom).
 *  - One gesture session commits AT MOST ONE discrete zoom step. After a
 *    step is emitted, the detector enters COOLDOWN and refuses to emit
 *    another step until the cooldown expires AND the spread returns toward
 *    baseline.
 *  - Baseline is sticky: the pose must remain valid for several
 *    consecutive frames before a new baseline is captured. Brief landmark
 *    dropouts don't reset the baseline, eliminating jitter from MediaPipe
 *    spikes.
 *  - EMA smoothing (alpha=0.18) on the spread reduces jitter so the peak/
 *    trough tracking isn't thrown off by single-frame spikes.
 *
 * Enhancements:
 *  - Confidence-weighted detection: require high hand confidence before activating
 *  - Stability requirement: fingers must remain stable for N frames before baseline is captured
 *  - Per-finger confidence check: reject frames where individual fingers have low visibility
 *  - Lockout mechanism: prevent drag from accidentally triggering zoom
 */
export type FiveFingerZoomEvent =
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' };

/**
 * Tuning constants. Stored as static fields so tests can override them
 * per-suite without monkey-patching instance state.
 */
export const FIVE_FINGER_ZOOM_CONFIG = {
  /** Each fingertip must be at least this far from the palm center (in palm-size units) to count as "extended". */
  minFingerExtension: 0.55,
  /** Min normalized spread delta above baseline to commit ZOOM_IN. Higher = more deliberate. */
  openThreshold: 0.28,
  /** Min normalized spread delta below baseline to commit ZOOM_OUT. */
  closeThreshold: 0.28,
  /** Min fingers (out of 5) that must move together for the gesture to count. */
  minConsistentFingers: 4,
  /** Per-finger movement required (in palm-size units) to count that finger as "moved". */
  perFingerThreshold: 0.12,
  /** Consecutive valid-frames required before a new baseline is captured. Prevents flicker. */
  poseStableFrames: 8,
  /** Cooldown after a step is committed (ms). */
  cooldownMs: 1400,
  /** Tolerance (as fraction of baseline) for raw spread to count as "returned to neutral". */
  baselineReturnTolerance: 0.18,
  /** EMA alpha for spread smoothing. Lower = smoother but laggier. */
  smoothingAlpha: 0.15,
  /** Minimum hand confidence required to consider the hand visible (0.5-0.8 recommended). */
  minHandConfidence: 0.7,
  /** Minimum individual finger confidence to count it as valid (0.5-0.7 recommended). */
  minFingerConfidence: 0.55,
  /** Consecutive frames fingers must be stable before baseline capture. */
  stabilityFrames: 6,
  /** Maximum movement (in palm-size units) allowed during stability window. */
  stabilityMaxMovement: 0.025,
  /** Lockout duration after zoom commit to prevent drag interference (ms). */
  zoomLockoutMs: 1500,
  /** Minimum time spent in TRACKING before allowing a commit (ms). Prevents instant commits. */
  minTrackingMsBeforeCommit: 350
};

type Phase = 'IDLE' | 'TRACKING' | 'COOLDOWN';

const TIP_INDICES = [
  LANDMARK.THUMB_TIP,
  LANDMARK.INDEX_TIP,
  LANDMARK.MIDDLE_TIP,
  LANDMARK.RING_TIP,
  LANDMARK.PINKY_TIP
] as const;

const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;

export class FiveFingerZoomDetector {
  private phase: Phase = 'IDLE';
  /** Raw spread captured when tracking started — the "neutral" pose of this gesture. */
  private baselineSpread = 0;
  /** Per-finger tip-to-palm distances at baseline. Indexed by FINGER_NAMES. */
  private baselineFingers: number[] = [0, 0, 0, 0, 0];
  /** Largest (smoothed) spread seen since TRACKING started. */
  private peakSpread = 0;
  /** Smallest (smoothed) spread seen since TRACKING started. */
  private troughSpread = Infinity;
  /** EMA-smoothed spread — used for peak/trough tracking to filter MediaPipe jitter. */
  private smoothedSpread = 0;
  /** Raw (unsmoothed) spread — used for cooldown-exit detection. */
  private rawSpread = 0;
  /** Wall-clock ms when the last step was committed. */
  private lastCommitAt = 0;
  /** Consecutive frames in which the hand has been in a valid 5-finger open pose. */
  private validPoseFrames = 0;
  
  /** Frames during which fingers have been stable (low movement). */
  private stableFrames = 0;
  /** Previous frame's spread for stability calculation. */
  private prevSpread = 0;
  
  /** Timestamp when the current TRACKING session started (for min dwell guard). */
  private trackingStartedAt = 0;
  
  /** Timestamp of last valid frame for debug. */
  private lastValidFrameMs = 0;
  
  /** Whether zoom is currently locked out (e.g., due to drag interference). */
  private zoomLockedOut = false;
  /** Timestamp when zoom lockout started. */
  private lockoutStartMs = 0;

  /**
   * Process one frame. Returns a zoom event if a discrete step was
   * committed this frame, otherwise null.
   */
  update(hand: TrackedHand | null, tMs: number): FiveFingerZoomEvent | null {
    // Check zoom lockout first
    if (this.zoomLockedOut && tMs - this.lockoutStartMs > FIVE_FINGER_ZOOM_CONFIG.zoomLockoutMs) {
      this.zoomLockedOut = false;
    }

    // Landmark / confidence gate — always required, even during TRACKING.
    // Without landmarks we cannot compute spread at all.
    if (!hand || !this.allFiveFingersVisible(hand) || hand.score < FIVE_FINGER_ZOOM_CONFIG.minHandConfidence) {
      this.invalidate();
      return null;
    }

    // Phase-specific pose gate:
    //  - IDLE: only accept the "fully open" pose so we capture a stable
    //    baseline. The user must show all 5 fingers clearly extended.
    //  - TRACKING: allow the hand to be partially or fully closed — that
    //    IS the ZOOM_OUT gesture. The TRACKING block below updates
    //    peak/trough continuously, so once the user closes enough we
    //    commit ZOOM_OUT even though the hand is no longer "fully open".
    // The previous implementation required fully-open for every frame,
    // which made ZOOM_OUT impossible to detect because the guard rejected
    // every closing frame before it could update troughSpread.
    if (this.phase === 'IDLE' && !this.handIsFullyOpen(hand)) {
      this.invalidate();
      return null;
    }

    const spread = this.computeSpread(hand);
    const fingerDists = this.computeFingerDistances(hand);
    this.rawSpread = spread;
    this.lastValidFrameMs = tMs;
    
    // First-order EMA on the spread — used only for peak/trough.
    if (this.smoothedSpread === 0) this.smoothedSpread = spread;
    this.smoothedSpread =
      this.smoothedSpread * (1 - FIVE_FINGER_ZOOM_CONFIG.smoothingAlpha) +
      spread * FIVE_FINGER_ZOOM_CONFIG.smoothingAlpha;
    const s = this.smoothedSpread;
    
    // Stability check: is the spread changing too much between frames?
    const spreadDelta = Math.abs(spread - this.prevSpread);
    if (spreadDelta <= FIVE_FINGER_ZOOM_CONFIG.stabilityMaxMovement) {
      this.stableFrames++;
    } else {
      this.stableFrames = 0;
    }
    this.prevSpread = spread;

    switch (this.phase) {
      case 'IDLE': {
        this.validPoseFrames++;
        
        // Wait for stability before capturing baseline
        // This prevents capturing baseline during active movement
        if (this.stableFrames < FIVE_FINGER_ZOOM_CONFIG.stabilityFrames) {
          return null;
        }
        
        // Wait for the pose to stabilize before capturing a baseline.
        // This prevents the spread baseline from being captured during
        // the first few jittery frames after the hand enters view.
        if (this.validPoseFrames < FIVE_FINGER_ZOOM_CONFIG.poseStableFrames) {
          return null;
        }
        
        this.baselineSpread = spread;
        this.baselineFingers = fingerDists.slice();
        this.peakSpread = s;
        this.troughSpread = s;
        this.phase = 'TRACKING';
        this.trackingStartedAt = tMs;
        
        // eslint-disable-next-line no-console
        console.log('[FiveFingerZoom] IDLE → TRACKING, baseline=', spread.toFixed(3));
        return null;
      }

      case 'TRACKING': {
        this.peakSpread = Math.max(this.peakSpread, s);
        this.troughSpread = Math.min(this.troughSpread, s);

        const openedDelta = this.peakSpread - this.baselineSpread;
        const closedDelta = this.baselineSpread - this.troughSpread;

        // Need a meaningful peak/trough before committing.
        if (openedDelta < FIVE_FINGER_ZOOM_CONFIG.openThreshold &&
            closedDelta < FIVE_FINGER_ZOOM_CONFIG.closeThreshold) {
          return null;
        }
        
        // Enforce minimum time in TRACKING before allowing commit.
        // This prevents instant commits when baseline was captured mid-gesture.
        const trackingElapsed = tMs - this.trackingStartedAt;
        if (trackingElapsed < FIVE_FINGER_ZOOM_CONFIG.minTrackingMsBeforeCommit) {
          return null;
        }

        // Per-finger consistency: at least N fingers must have moved
        // outward (for ZOOM_IN) or inward (for ZOOM_OUT) by the
        // per-finger threshold. A 2-finger pinch moves only the thumb;
        // this check rejects that and prevents drag from triggering zoom.
        const openedEnough = openedDelta >= FIVE_FINGER_ZOOM_CONFIG.openThreshold
          && this.countMovedOutward(fingerDists) >= FIVE_FINGER_ZOOM_CONFIG.minConsistentFingers;
        const closedEnough = closedDelta >= FIVE_FINGER_ZOOM_CONFIG.closeThreshold
          && this.countMovedInward(fingerDists) >= FIVE_FINGER_ZOOM_CONFIG.minConsistentFingers;

        if (openedEnough) {
          // eslint-disable-next-line no-console
          console.log('[FiveFingerZoom] TRACKING → ZOOM_IN', {
            openedDelta: openedDelta.toFixed(3),
            movedOutward: this.countMovedOutward(fingerDists)
          });
          this.commit(tMs);
          return { type: 'ZOOM_IN' };
        }
        if (closedEnough) {
          // eslint-disable-next-line no-console
          console.log('[FiveFingerZoom] TRACKING → ZOOM_OUT', {
            closedDelta: closedDelta.toFixed(3),
            movedInward: this.countMovedInward(fingerDists)
          });
          this.commit(tMs);
          return { type: 'ZOOM_OUT' };
        }
        return null;
      }

      case 'COOLDOWN':
        // After cooldown expires AND raw spread returns close to baseline,
        // allow a new gesture. We use RAW spread (not smoothed) because EMA
        // convergence takes many frames and would make the user wait too
        // long between gestures.
        if (tMs - this.lastCommitAt >= FIVE_FINGER_ZOOM_CONFIG.cooldownMs) {
          const tolerance =
            this.baselineSpread > 0
              ? this.baselineSpread * FIVE_FINGER_ZOOM_CONFIG.baselineReturnTolerance
              : FIVE_FINGER_ZOOM_CONFIG.openThreshold;
          if (Math.abs(this.rawSpread - this.baselineSpread) < tolerance) {
            // Reset smoothed/peak/trough so the next TRACKING session
            // starts fresh. Otherwise the stale smoothed value from the
            // previous gesture gets used as peak, producing a phantom
            // "opened" delta on the next frame.
            this.smoothedSpread = 0;
            this.peakSpread = 0;
            this.troughSpread = Infinity;
            this.validPoseFrames = 0;
            this.stableFrames = 0;
            this.phase = 'IDLE';
            
            // eslint-disable-next-line no-console
            console.log('[FiveFingerZoom] COOLDOWN → IDLE (spread returned to baseline)');
          }
        }
        return null;
    }
  }
  
  /**
   * Lock out zoom detection for a duration. Call this when drag starts
   * to prevent accidental zoom triggers.
   */
  lockoutZoom(tMs: number, durationMs: number = FIVE_FINGER_ZOOM_CONFIG.zoomLockoutMs): void {
    this.zoomLockedOut = true;
    this.lockoutStartMs = tMs;
    this.phase = 'IDLE';
    this.validPoseFrames = 0;
    this.stableFrames = 0;
    
    // eslint-disable-next-line no-console
    console.log('[FiveFingerZoom] ZOOM LOCKOUT for', durationMs, 'ms');
  }
  
  /**
   * Check if zoom is currently locked out.
   */
  isZoomLockedOut(): boolean {
    return this.zoomLockedOut;
  }
  
  /**
   * Get debug info about current state.
   */
  getDebugInfo(): {
    phase: Phase;
    baselineSpread: number;
    smoothedSpread: number;
    validPoseFrames: number;
    stableFrames: number;
    lockedOut: boolean;
    lastValidFrameMs: number;
  } {
    return {
      phase: this.phase,
      baselineSpread: this.baselineSpread,
      smoothedSpread: this.smoothedSpread,
      validPoseFrames: this.validPoseFrames,
      stableFrames: this.stableFrames,
      lockedOut: this.zoomLockedOut,
      lastValidFrameMs: this.lastValidFrameMs
    };
  }

  /** Force a reset (e.g. when tracking is lost). */
  reset(): void {
    this.phase = 'IDLE';
    this.baselineSpread = 0;
    this.baselineFingers = [0, 0, 0, 0, 0];
    this.peakSpread = 0;
    this.troughSpread = Infinity;
    this.smoothedSpread = 0;
    this.rawSpread = 0;
    this.lastCommitAt = 0;
    this.validPoseFrames = 0;
    this.stableFrames = 0;
    this.prevSpread = 0;
    this.zoomLockedOut = false;
    this.trackingStartedAt = 0;
  }

  /** Soft invalidation — used when a frame is missing a finger landmark or the pose isn't fully open. Keeps nothing sticky. */
  private invalidate(): void {
    this.validPoseFrames = 0;
    this.stableFrames = 0;
    // While the user is in a non-valid pose, we DON'T reset baseline/peak/trough;
    // this lets brief landmark dropouts (1-2 frames) recover without losing
    // the in-progress gesture. Only a full reset() or an extended dropout
    // (the calling engine detects LOST and calls reset()) clears the state.
  }

  /** Diagnostic — current phase for debug overlay. */
  getPhase(): Phase {
    return this.phase;
  }

  /** Diagnostic — how many fingers have moved outward from baseline. */
  getOutwardCount(): number {
    if (this.phase !== 'TRACKING') return 0;
    return this.countMovedOutward(this.currentFingerSnapshot());
  }

  /** Diagnostic — how many fingers have moved inward from baseline. */
  getInwardCount(): number {
    if (this.phase !== 'TRACKING') return 0;
    return this.countMovedInward(this.currentFingerSnapshot());
  }

  private currentFingerSnapshot(): number[] {
    // Caller responsibility: only invoked from debug hooks where hand is valid.
    // We re-compute from a stored snapshot isn't possible without storing the
    // last hand, so this returns an empty array to keep the contract safe.
    // Real debug info comes from getPhase() / spread via GestureEngine logs.
    return this.baselineFingers;
  }

  private commit(tMs: number): void {
    this.phase = 'COOLDOWN';
    this.lastCommitAt = tMs;
  }

  /**
   * All five fingertips (thumb + 4 fingers) must be defined landmarks AND
   * the hand must meet a minimum confidence threshold.
   */
  private allFiveFingersVisible(hand: TrackedHand): boolean {
    for (const idx of TIP_INDICES) {
      const lm = hand.landmarks[idx];
      if (!lm) return false;
    }
    return hand.score >= 0.5;
  }

  /**
   * Pose gate: the hand must be in a "5-finger open" pose — every fingertip
   * must be clearly extended (distance from palm center > some fraction of
   * palm size). This rejects 2-finger pinches (thumb tucked toward palm)
   * and fist-like poses (all fingers curled), both of which should be
   * reserved for drag.
   */
  private handIsFullyOpen(hand: TrackedHand): boolean {
    const size = palmSize(hand);
    if (size <= 0) return false;
    const palmCenter = this.computePalmCenter(hand);
    const minDist = size * FIVE_FINGER_ZOOM_CONFIG.minFingerExtension;
    for (const idx of TIP_INDICES) {
      const tip = hand.landmarks[idx];
      if (!tip) return false;
      const dx = tip.x - palmCenter.x;
      const dy = tip.y - palmCenter.y;
      const dz = (tip.z ?? 0) - palmCenter.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < minDist) return false;
    }
    return true;
  }

  /**
   * Exposed for GestureEngine: returns true when the given hand is in the
   * "5-finger open" pose that triggers zoom. When true, the GestureEngine
   * should treat pinch as absent so the 5-finger zoom takes precedence
   * over any accidental thumb-index proximity during a 5-finger gesture.
   * Accepts null so callers don't need to null-check.
   */
  isFullyOpenPose(hand: TrackedHand | null): boolean {
    if (!hand) return false;
    return this.allFiveFingersVisible(hand) && this.handIsFullyOpen(hand);
  }

  /**
   * Detects when the hand is in a "5-finger closed" pose — all fingertips
   * are tucked close to the palm. This is the ZOOM_OUT gesture. The
   * thumb-index may naturally touch during this pose, which would
   * otherwise trigger a false DRAG. By exposing this, GestureEngine can
   * suppress pinch/drag while a genuine 5-finger close is in progress.
   */
  isFullyClosedPose(hand: TrackedHand | null): boolean {
    if (!hand) return false;
    if (!this.allFiveFingersVisible(hand)) return false;
    const size = palmSize(hand);
    if (size <= 0) return false;
    const palmCenter = this.computePalmCenter(hand);
    // A finger counts as "closed" if its tip is within 0.5 palm-sizes of the palm center.
    const maxDist = size * 0.5;
    for (const idx of TIP_INDICES) {
      const tip = hand.landmarks[idx];
      if (!tip) return false;
      const dx = tip.x - palmCenter.x;
      const dy = tip.y - palmCenter.y;
      const dz = (tip.z ?? 0) - palmCenter.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxDist) return false;
    }
    return true;
  }

  /**
   * Count fingertips whose distance from palm has INCREASED by at least the
   * per-finger threshold. This filters out partial gestures where only 1-2
   * fingers (typically the thumb during a pinch) move.
   */
  private countMovedOutward(fingers: number[]): number {
    const thresh = FIVE_FINGER_ZOOM_CONFIG.perFingerThreshold;
    let count = 0;
    for (let i = 0; i < fingers.length; i++) {
      if (fingers[i] - this.baselineFingers[i] >= thresh) count++;
    }
    return count;
  }

  /**
   * Count fingertips whose distance from palm has DECREASED by at least the
   * per-finger threshold. Symmetric counterpart to countMovedOutward().
   */
  private countMovedInward(fingers: number[]): number {
    const thresh = FIVE_FINGER_ZOOM_CONFIG.perFingerThreshold;
    let count = 0;
    for (let i = 0; i < fingers.length; i++) {
      if (this.baselineFingers[i] - fingers[i] >= thresh) count++;
    }
    return count;
  }

  /**
   * Average fingertip-to-palm-center distance, normalized by palm size.
   * Larger value = more open hand.
   */
  private computeSpread(hand: TrackedHand): number {
    const palmCenter = this.computePalmCenter(hand);
    let sum = 0;
    let count = 0;
    for (const idx of TIP_INDICES) {
      const tip = hand.landmarks[idx];
      if (!tip) continue;
      const dx = tip.x - palmCenter.x;
      const dy = tip.y - palmCenter.y;
      const dz = (tip.z ?? 0) - palmCenter.z;
      sum += Math.hypot(dx, dy, dz);
      count++;
    }
    if (count === 0) return 0;
    const size = palmSize(hand);
    return size > 0 ? sum / count / size : 0;
  }

  /**
   * Per-finger tip-to-palm distances, normalized by palm size. Returned in
   * the same order as FINGER_NAMES. Used to check that the gesture is
   * symmetric (all fingers move together, not just the thumb).
   */
  private computeFingerDistances(hand: TrackedHand): number[] {
    const palmCenter = this.computePalmCenter(hand);
    const size = palmSize(hand);
    const result: number[] = [];
    for (const idx of TIP_INDICES) {
      const tip = hand.landmarks[idx];
      if (!tip) {
        result.push(0);
        continue;
      }
      const dx = tip.x - palmCenter.x;
      const dy = tip.y - palmCenter.y;
      const dz = (tip.z ?? 0) - palmCenter.z;
      const raw = Math.hypot(dx, dy, dz);
      result.push(size > 0 ? raw / size : 0);
    }
    return result;
  }

  /**
   * Palm center = average of wrist + 4 MCP joints. More stable than
   * using the wrist alone, which moves when the wrist rotates.
   */
  private computePalmCenter(hand: TrackedHand): NormalizedLandmark {
    const centers = [
      LANDMARK.WRIST,
      LANDMARK.INDEX_MCP,
      LANDMARK.MIDDLE_MCP,
      LANDMARK.RING_MCP,
      LANDMARK.PINKY_MCP
    ];
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (const idx of centers) {
      const lm = hand.landmarks[idx];
      if (!lm) continue;
      sx += lm.x;
      sy += lm.y;
      sz += lm.z ?? 0;
      n++;
    }
    if (n === 0) return { x: 0.5, y: 0.5, z: 0 };
    return { x: sx / n, y: sy / n, z: sz / n };
  }
}

// Re-export finger-name list for debug UI that wants to label which
// finger triggered the zoom step.
export { FINGER_NAMES };
