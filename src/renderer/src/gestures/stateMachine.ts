/**
 * Gesture interaction FSM.
 *
 * Click model: DWELL — the cursor must rest over an interactive target for
 * `dwellMs` without significant motion and without pinching. The orange ring
 * counts up; when it fills, a CLICK fires. This is the original click behavior
 * the user wants preserved.
 *
 * Drag / Zoom model: PINCH-based (added on top of click).
 *   - Pinch + move cursor >= dragPx  -> DRAGGING
 *   - Pinch + dynamic pinch distance -> ZOOMING
 *   - Pinch held still for holdDragMs without moving -> HOLD_DRAG (move cursor
 *     to drag without re-pinch)
 *
 *   IDLE
 *     -> TRACKING         (hand visible)
 *   TRACKING
 *     -> HOVERING         (cursor over interactive element)
 *     -> LOST_TRACKING    (hand lost)
 *   HOVERING
 *     -> DWELLING         (cursor stable over target — start dwell timer)
 *     -> TRACKING         (cursor leaves target)
 *     -> PRESSING         (pinch starts; dwell aborted)
 *     -> LOST_TRACKING    (hand lost)
 *   DWELLING
 *     -> TRACKING/HOVERING (dwell completes — CLICK fires)
 *     -> TRACKING         (cursor moves off target — dwell canceled)
 *     -> PRESSING         (pinch starts — dwell canceled)
 *     -> LOST_TRACKING    (hand lost)
 *   PRESSING
 *     -> DRAGGING         (cursor moved >= dragPx before release)
 *     -> HOLD_DRAG        (pinch held >= holdDragMs without moving)
 *     -> ZOOMING          (pinch distance is dynamic — zoom gesture)
 *     -> TRACKING/HOVERING (pinch released; no CLICK — pinch is for drag/zoom)
 *   DRAGGING
 *     -> TRACKING/HOVERING (pinch released; DRAG_END fires)
 *   HOLD_DRAG
 *     -> HOLD_DRAGGING    (cursor moved >= holdDragSensitivityPx)
 *     -> TRACKING/HOVERING (pinch released; no CLICK)
 *     -> ZOOMING          (pinch distance becomes dynamic)
 *   HOLD_DRAGGING
 *     -> HOLD_DRAG        (cursor stable for holdDragPauseMs)
 *     -> TRACKING/HOVERING (pinch released; HOLD_DRAG_END fires)
 *   ZOOMING
 *     -> TRACKING/HOVERING (pinch released; ZOOM_END fires)
 *   LOST_TRACKING
 *     -> TRACKING         (hand returns)
 *     -> IDLE             (hand absent beyond lostGraceMs)
 */
export type GestureState =
  | 'IDLE'
  | 'TRACKING'
  | 'HOVERING'
  | 'DWELLING'
  | 'PRESSING'
  | 'DRAGGING'
  | 'HOLD_DRAG'
  | 'HOLD_DRAGGING'
  | 'ZOOMING'
  | 'LOST_TRACKING';

import type { PinchState } from './PinchDetector.js';

export interface GestureFSMOptions {
  /** ms the cursor must rest over an interactive target to fire a CLICK. Default 800. */
  dwellMs?: number;
  /** px of cursor movement allowed during dwell before the timer resets. Default 4. */
  dwellJitterPx?: number;
  /** px of cursor movement required to start DRAGGING while pressing. Default 6. */
  dragPx?: number;
  /** ms of continuous pinch required to enter HOLD_DRAG mode. Default 3000. */
  holdDragMs?: number;
  /** px of cursor movement required to start HOLD_DRAGGING once hold is armed. Default 4. */
  holdDragSensitivityPx?: number;
  /** ms cursor must be still to fall back from HOLD_DRAGGING to HOLD_DRAG. Default 300. */
  holdDragPauseMs?: number;
  /** grace period for lost-hand recovery before IDLE. Default 500. */
  lostGraceMs?: number;
  /**
   * Warmup window at the start of each dwell during which drift checks are
   * skipped. This absorbs MediaPipe filter settling and the first frames of
   * hand stabilization so a fresh dwell isn't cancelled by initial jitter.
   * Default 150 ms.
   */
  dwellWarmupMs?: number;
  /**
   * How many consecutive frames of drift-over-threshold are required before a
   * dwell is cancelled. A single MediaPipe spike or one bad frame should NOT
   * cancel — only sustained motion should. Default 3 frames.
   */
  dwellConsecFramesToCancel?: number;
  /**
   * Maximum multiplier that the drift threshold grows to as dwell progresses.
   * Starts at `dwellJitterPx`, ends at `dwellJitterPx * (1 + dwellAdaptiveGrowth)`.
   * This means a hand that is stable for the first half is allowed to wander more
   * as it nears the click. Default 2.0 (i.e. up to 3× the base threshold).
   */
  dwellAdaptiveGrowth?: number;
  /**
   * ms of consecutive frames where the cursor was over a target, used to
   * add hysteresis on `overTarget` so a cursor hovering at the edge of a
   * button doesn't flicker in/out. Implemented in the FSM by remembering the
   * last positive frame; if a frame says `!overTarget` but the previous frame
   * was within `dwellTargetGraceMs` ago, the FSM still considers itself over
   * the target. Default 60 ms.
   */
  dwellTargetGraceMs?: number;
}

export interface PointerSnapshot {
  /** Screen-space position in pixels. */
  position: { x: number; y: number };
  /** True if the cursor is over a targetable element. */
  overTarget: boolean;
  /** True if the hand is currently tracked (visible + above confidence threshold). */
  handVisible: boolean;
  /** Pinch detector state for this frame. */
  pinchState: PinchState;
  /** ms the user has been continuously holding the pinch (0 if not in PINCH_HOLD). */
  pinchHoldMs: number;
  /** Delta in normalized pinch distance since last frame (positive = opening, negative = closing). */
  pinchDelta: number;
  /** Wall-clock timestamp. */
  tMs: number;
}

export type GestureEvent =
  | { type: 'CLICK'; tMs: number }
  | { type: 'HOVER_ENTER'; tMs: number }
  | { type: 'HOVER_LEAVE'; tMs: number }
  | { type: 'DWELL_PROGRESS'; tMs: number; progress: number }
  | { type: 'DWELL_CANCEL'; tMs: number }
  | { type: 'HOLD_PROGRESS'; tMs: number; progress: number }
  | { type: 'DRAG_START'; tMs: number }
  | { type: 'DRAG_MOVE'; tMs: number; x: number; y: number }
  | { type: 'DRAG_END'; tMs: number }
  /**
   * Fired the instant a pinch is first detected (entering PRESSING state).
   * Allows the dispatcher to lock the drag target element immediately,
   * before the FSM decides whether this pinch will become a drag or zoom.
   */
  | { type: 'PINCH_START'; tMs: number; x: number; y: number }
  | { type: 'HOLD_DRAG_READY'; tMs: number }
  | { type: 'HOLD_DRAG_MOVE'; tMs: number; x: number; y: number }
  | { type: 'HOLD_DRAG_END'; tMs: number }
  | { type: 'ZOOM_START'; tMs: number }
  | { type: 'ZOOM_UPDATE'; tMs: number; scaleFactor: number }
  | { type: 'ZOOM_END'; tMs: number }
  | { type: 'LOST'; tMs: number }
  | { type: 'RECOVERED'; tMs: number };

export type GestureListener = (e: GestureEvent) => void;

export class GestureFSM {
  private state: GestureState = 'IDLE';
  private dwellMs: number;
  private dwellJitterPx: number;
  private dragPx: number;
  /** px the cursor must move in PRESSING before committing to DRAG mode. */
  private dragCommitPx: number;
  /**
   * Cursor threshold while actively pinching. Higher than dragCommitPx so
   * natural hand-jitter during a pinch-zoom gesture doesn't get misread
   * as drag intent.
   */
  private dragCommitPxDuringPinch: number;
  /** pinch-distance delta required to commit to ZOOM mode (raised from 0.12 to avoid flicker). */
  private zoomActivationThreshold: number;
  private holdDragMs: number;
  private holdDragSensitivityPx: number;
  private holdDragPauseMs: number;
  private lostGraceMs: number;
  private dwellWarmupMs: number;
  private dwellConsecFramesToCancel: number;
  private dwellAdaptiveGrowth: number;
  private dwellTargetGraceMs: number;
  /** Position when the dwell started — kept for compatibility / debugging. */
  private dwellStartPosition: { x: number; y: number } | null = null;
  /** Wall-clock ms when the current dwell began. */
  private dwellStartMs: number | null = null;
  /**
   * Rolling position buffer used to compute drift relative to a recent
   * baseline (~100 ms ago) instead of the original start position. This is
   * much more forgiving of natural hand drift near a target.
   */
  private positionHistory: Array<{ x: number; y: number; tMs: number }> = [];
  /** Counter for sustained-drift frames. Resets on stable frames. */
  private consecutiveDriftFrames = 0;
  /** Wall-clock ms when `overTarget` was last observed true. Used for grace. */
  private lastOverTargetMs: number | null = null;
  /** Last reported "effective" over-target (with grace applied). */
  private effectiveOverTarget = false;
  /** Position of the cursor when the current pinch began. */
  private pressStartPosition: { x: number; y: number } | null = null;
  /** Wall-clock ms when the current pinch began. */
  private pressStartMs: number | null = null;
  /** Cumulative dynamic pinch delta since press start. Used for zoom activation. */
  private pinchDeltaAccum = 0;
  /**
   * Locked-in pinch mode for the current press. Set on first significant
   * signal in PRESSING (either cursor motion OR pinch distance change) and
   * held until pinch release. Prevents drag/zoom flickering when the user
   * intends one but the other briefly exceeds its threshold.
   *  - 'drag'  → entered DRAGGING
   *  - 'zoom'  → entered ZOOMING
   *  - 'hold'  → entered HOLD_DRAG / HOLD_DRAGGING
   *  - null    → no mode chosen yet (still in PRESSING)
   */
  private pressMode: 'drag' | 'zoom' | 'hold' | null = null;
  /** Position when HOLD_DRAGGING began (used to detect pause). */
  private holdDragLastMoveMs: number | null = null;
  /** Wall-clock ms when hand was last visible (used for lostGraceMs). */
  private lastSeenAt = 0;
  /**
   * Wall-clock ms until which DRAG commits are blocked. Set when a discrete
   * zoom commits; cleared when it expires. Prevents the natural hand-return
   * through 2-finger pose after a zoom from being interpreted as a drag.
   */
  private dragSuppressedUntilMs = 0;
  private listeners = new Set<GestureListener>();

  constructor(opts: GestureFSMOptions = {}) {
    this.dwellMs = opts.dwellMs ?? 800;
    this.dwellJitterPx = opts.dwellJitterPx ?? 6;
    this.dragPx = opts.dragPx ?? 6;
    // Commit to drag only after consistent motion (higher than dragPx).
    this.dragCommitPx = (opts as any).dragCommitPx ?? 4;
    /**
     * Drag cursor threshold while pinching. Higher than dragCommitPx so
     * natural hand-jitter during a pinch-zoom gesture doesn't get misread
     * as drag intent. With dragCommitPxDuringPinch ≈ 14 and the standard
     * thumb-finger jitter (~6–10px), a pure zoom stays in zoom mode.
     */
    this.dragCommitPxDuringPinch = (opts as any).dragCommitPxDuringPinch ?? 14;
    // 0.20 = pinch must be noticeably extended/contracted before zoom activates.
    // Much less sensitive than before (0.12) — prevents accidental zoom during drag.
    this.zoomActivationThreshold = (opts as any).zoomActivationThreshold ?? 0.08;
    this.holdDragMs = opts.holdDragMs ?? 3000;
    this.holdDragSensitivityPx = opts.holdDragSensitivityPx ?? 4;
    this.holdDragPauseMs = opts.holdDragPauseMs ?? 300;
    this.lostGraceMs = opts.lostGraceMs ?? 500;
    this.dwellWarmupMs = opts.dwellWarmupMs ?? 250;
    // 3 frames of sustained drift required to cancel dwell (filters transient
    // hand jitter / MediaPipe spikes that don't reflect user intent).
    this.dwellConsecFramesToCancel = opts.dwellConsecFramesToCancel ?? 3;
    this.dwellAdaptiveGrowth = opts.dwellAdaptiveGrowth ?? 2.0;
    // 250 ms grace period where the cursor may briefly leave the target
    // (edge jitter) without cancelling hover/dwell.
    this.dwellTargetGraceMs = opts.dwellTargetGraceMs ?? 250;
  }

  getState(): GestureState {
    return this.state;
  }

  onEvent(cb: GestureListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  configure(opts: GestureFSMOptions): void {
    if (opts.dwellMs !== undefined) this.dwellMs = opts.dwellMs;
    if (opts.dwellJitterPx !== undefined) this.dwellJitterPx = opts.dwellJitterPx;
    if (opts.dragPx !== undefined) this.dragPx = opts.dragPx;
    if (opts.holdDragMs !== undefined) this.holdDragMs = opts.holdDragMs;
    if (opts.holdDragSensitivityPx !== undefined) this.holdDragSensitivityPx = opts.holdDragSensitivityPx;
    if (opts.holdDragPauseMs !== undefined) this.holdDragPauseMs = opts.holdDragPauseMs;
    if (opts.lostGraceMs !== undefined) this.lostGraceMs = opts.lostGraceMs;
    if (opts.dwellWarmupMs !== undefined) this.dwellWarmupMs = opts.dwellWarmupMs;
    if (opts.dwellConsecFramesToCancel !== undefined)
      this.dwellConsecFramesToCancel = opts.dwellConsecFramesToCancel;
    if (opts.dwellAdaptiveGrowth !== undefined)
      this.dwellAdaptiveGrowth = opts.dwellAdaptiveGrowth;
    if (opts.dwellTargetGraceMs !== undefined)
      this.dwellTargetGraceMs = opts.dwellTargetGraceMs;
  }

  /**
   * Return the current "effective" over-target state with grace applied. This
   * is updated internally as snapshots are processed. Exposed for tests.
   */
  isOverTarget(): boolean {
    return this.effectiveOverTarget;
  }

  /**
   * Called by GestureEngine right after a discrete depth-zoom step
   * commits. Locks out DRAG transitions for `lockoutMs` so the user's hand
   * returning through a transient 2-finger pose isn't interpreted as a
   * drag on the underlying content. Without this, every zoom step is
   * followed by an unwanted drag/click ripple.
   */
  notifyZoomCommitted(tMs: number, lockoutMs = 700): void {
    this.dragSuppressedUntilMs = tMs + lockoutMs;
  }

  /**
   * True while DRAG commits are blocked by the post-zoom lockout window.
   */
  isDragSuppressed(tMs: number): boolean {
    return tMs < this.dragSuppressedUntilMs;
  }

  /**
   * Smooth ease-out curve for dwell progress. Starts slow and accelerates,
   * giving the user a clear visual ramp-up to the click without feeling linear
   * or mechanical. Equivalent to 1 - (1 - t)^3.
   */
  private easeOutCubic(t: number): number {
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    return 1 - Math.pow(1 - clamped, 3);
  }

  /**
   * Append the current position to the rolling history and trim entries older
   * than 500 ms. Used to compute drift relative to a recent baseline instead
   * of the original dwell-start position.
   */
  private pushPosition(snap: PointerSnapshot): void {
    this.positionHistory.push({ x: snap.position.x, y: snap.position.y, tMs: snap.tMs });
    const cutoff = snap.tMs - 500;
    while (this.positionHistory.length > 0 && this.positionHistory[0].tMs < cutoff) {
      this.positionHistory.shift();
    }
  }

  /**
   * Find the position from history closest to `targetTMs` but not the most
   * recent entry. Returns null if there isn't enough history yet.
   */
  private findBaselinePosition(targetTMs: number): { x: number; y: number } | null {
    // Walk back from the second-to-last entry; the last entry is "now".
    for (let i = this.positionHistory.length - 2; i >= 0; i--) {
      const e = this.positionHistory[i];
      if (e.tMs <= targetTMs) {
        return { x: e.x, y: e.y };
      }
    }
    return null;
  }

  /**
   * Apply over-target hysteresis using `dwellTargetGraceMs`. This prevents
   * flicker when the cursor is at the edge of an element (sub-pixel jitter
   * from MediaPipe landmarks can briefly "miss" the target even when the
   * user's hand hasn't actually moved away).
   *
   * The hysteresis is only applied when position is stable — a genuine cursor
   * jump means the user intentionally moved, so we respect the overTarget change
   * immediately without delay.
   */
  private computeEffectiveOverTarget(snap: PointerSnapshot): boolean {
    if (snap.overTarget) {
      this.lastOverTargetMs = snap.tMs;
      this.effectiveOverTarget = true;
      return true;
    }

    // Apply grace period as long as the cursor was recently over a target.
    // We deliberately do NOT break grace on cursor jumps — hand jitter of
    // 4–6 px/frame at 60 fps routinely exceeds dwellJitterPx*0.5 = 3 px,
    // which would otherwise flip effectiveOverTarget false on every frame
    // and cancel the dwell continuously. The user has 250 ms grace to
    // re-acquire the target before the FSM considers the hover ended.
    if (
      this.lastOverTargetMs !== null &&
      snap.tMs - this.lastOverTargetMs > 0 &&
      snap.tMs - this.lastOverTargetMs <= this.dwellTargetGraceMs
    ) {
      return this.effectiveOverTarget;
    }
    this.effectiveOverTarget = false;
    return false;
  }

  /**
   * Process a new pointer snapshot. Returns the next state.
   */
  update(snap: PointerSnapshot): GestureState {
    // --- Hand visibility handling ---
    if (!snap.handVisible) {
      if (this.state !== 'IDLE' && this.state !== 'LOST_TRACKING') {
        this.cancelDwell();
        this.cancelPress();
        this.lastSeenAt = snap.tMs;
        this.state = 'LOST_TRACKING';
        this.emit({ type: 'LOST', tMs: snap.tMs });
      } else if (this.state === 'LOST_TRACKING' && snap.tMs - this.lastSeenAt > this.lostGraceMs) {
        this.state = 'IDLE';
      }
      return this.state;
    }

    // Apply over-target hysteresis so edge-of-button flicker doesn't cancel.
    const effectiveOverTarget = this.computeEffectiveOverTarget(snap);

    // Always track position history while the hand is visible.
    this.pushPosition(snap);

    // --- Recovery from LOST_TRACKING / IDLE ---
    if (this.state === 'LOST_TRACKING' || this.state === 'IDLE') {
      this.state = effectiveOverTarget ? 'HOVERING' : 'TRACKING';
      this.emit({ type: 'RECOVERED', tMs: snap.tMs });
    }

    const isPinching = snap.pinchState === 'PINCH_HOLD';
    const inPressState =
      this.state === 'PRESSING' || this.state === 'DRAGGING' ||
      this.state === 'HOLD_DRAG' || this.state === 'HOLD_DRAGGING' ||
      this.state === 'ZOOMING';

    // --- Hover / dwell transitions (only when NOT in a press-related state) ---
    if (!inPressState) {
      if (this.state === 'TRACKING' && effectiveOverTarget) {
        this.state = 'HOVERING';
        this.emit({ type: 'HOVER_ENTER', tMs: snap.tMs });
      } else if (this.state === 'HOVERING' && !effectiveOverTarget) {
        this.cancelDwell();
        this.state = 'TRACKING';
        this.emit({ type: 'HOVER_LEAVE', tMs: snap.tMs });
      } else if (this.state === 'DWELLING' && !effectiveOverTarget) {
        this.cancelDwell();
        this.state = 'TRACKING';
        this.emit({ type: 'HOVER_LEAVE', tMs: snap.tMs });
      } else if (this.state === 'HOVERING' && effectiveOverTarget && !isPinching) {
        // Cursor over target, no pinch → start dwelling.
        this.beginDwell(snap);
        this.state = 'DWELLING';
      } else if (this.state === 'DWELLING' && isPinching) {
        // Pinch cancels dwell and starts press (for drag/zoom).
        this.cancelDwell();
        this.beginPress(snap);
        this.state = 'PRESSING';
      }
    }

    // --- Handle press start / end (only when in press-related states) ---
    if (isPinching) {
      if (this.pressStartMs === null && (this.state === 'TRACKING' || this.state === 'HOVERING' || this.state === 'DWELLING')) {
        this.beginPress(snap);
        this.state = 'PRESSING';
      } else if (this.pressStartMs !== null) {
        // Accumulate pinch delta while pinching for zoom detection.
        if (snap.pinchDelta !== 0) this.pinchDeltaAccum += snap.pinchDelta;
      }
    } else if (this.pressStartMs !== null) {
      // Pinch released — end the press and decide what final event to fire.
      this.endPress(snap);
      return this.state;
    }

    // --- Dispatch by current state ---
    switch (this.state) {
      case 'DWELLING': {
        const dwellDuration = snap.tMs - (this.dwellStartMs ?? snap.tMs);

        // 1) Warmup: absorb initial settling without cancelling. The ring
        //    should already be filling from progress events.
        if (dwellDuration < this.dwellWarmupMs) {
          const linearProgress = Math.min(dwellDuration / this.dwellMs, 1);
          const progress = this.easeOutCubic(linearProgress);
          this.emit({ type: 'DWELL_PROGRESS', tMs: snap.tMs, progress });
          break;
        }

        // 2) Drift is measured from a recent baseline (~100 ms ago), not from
        //    the dwell-start position. This makes the dwell forgiving of the
        //    natural wandering a hand does while "holding still".
        const baseline = this.findBaselinePosition(snap.tMs - 100);
        const drift = baseline
          ? Math.hypot(snap.position.x - baseline.x, snap.position.y - baseline.y)
          : 0;

        // 3) Adaptive threshold: starts at base, grows toward base * (1+growth)
        //    as dwell progresses. Allows more drift near the end so a hand
        //    that held stable for the first half isn't punished for tiny
        //    wandering just before completion.
        const progressRatio = Math.min(dwellDuration / this.dwellMs, 1);
        const adaptiveThreshold =
          this.dwellJitterPx * (1 + this.dwellAdaptiveGrowth * progressRatio);

        // 4) Track sustained-drift frames. Single spikes decay, sustained
        //    motion accumulates. Requires `dwellConsecFramesToCancel` consecutive
        //    over-threshold frames before cancelling.
        if (drift > adaptiveThreshold) {
          this.consecutiveDriftFrames++;
        } else {
          // Decay back to zero when the hand is steady again.
          if (this.consecutiveDriftFrames > 0) this.consecutiveDriftFrames--;
        }

        if (this.consecutiveDriftFrames >= this.dwellConsecFramesToCancel) {
          // Cancel and restart in place if still over target, otherwise exit.
          this.cancelDwell();
          if (effectiveOverTarget && !isPinching) {
            this.beginDwell(snap);
            this.state = 'DWELLING';
          } else {
            this.state = effectiveOverTarget ? 'HOVERING' : 'TRACKING';
          }
          this.emit({ type: 'DWELL_CANCEL', tMs: snap.tMs });
          break;
        }

        // 5) Completion check.
        if (dwellDuration >= this.dwellMs) {
          // Dwell complete — fire CLICK and reset.
          this.emit({ type: 'CLICK', tMs: snap.tMs });
          this.cancelDwell();
          // Stay on the same target so user can keep clicking without re-acquiring.
          this.state = effectiveOverTarget ? 'HOVERING' : 'TRACKING';
        } else {
          const linearProgress = Math.min(dwellDuration / this.dwellMs, 1);
          const progress = this.easeOutCubic(linearProgress);
          this.emit({ type: 'DWELL_PROGRESS', tMs: snap.tMs, progress });
        }
        break;
      }

      case 'PRESSING': {
        const pressDuration = snap.tMs - (this.pressStartMs ?? snap.tMs);
        const cursorDelta = this.cursorDeltaSincePress(snap);

        // Pinch is now reserved for DRAG / HOLD_DRAG only. Zoom is
        // handled by the depth-based gesture (HandDepthZoomDetector), so
        // there's no need to discriminate pinch-vs-zoom here. Cursor
        // motion during a pinch commits drag immediately at the standard
        // dragPx threshold.
        if (this.pressMode === null) {
          // Post-zoom drag-suppression window: a discrete zoom just
          // committed, and the user's hand is naturally returning through a
          // 2-finger pose. The cursor motion in that window is part of the
          // zoom gesture, NOT a drag intent. Skip the DRAG commit; let the
          // press end without firing DRAG_START.
          if (this.isDragSuppressed(snap.tMs)) {
            // Stay in PRESSING until the user actually re-purposes. Once the
            // pinch releases the press ends naturally with no DRAG_START fired.
            const holdProgress = Math.min(snap.pinchHoldMs / this.holdDragMs, 1);
            this.emit({ type: 'HOLD_PROGRESS', tMs: snap.tMs, progress: holdProgress });
            break;
          }
          if (cursorDelta >= this.dragPx) {
            this.pressMode = 'drag';
            this.state = 'DRAGGING';
            this.emit({ type: 'DRAG_START', tMs: snap.tMs });
            this.emit({ type: 'DRAG_MOVE', tMs: snap.tMs, x: snap.position.x, y: snap.position.y });
          } else if (pressDuration >= this.holdDragMs && cursorDelta < this.dragCommitPx) {
            this.pressMode = 'hold';
            this.state = 'HOLD_DRAG';
            this.emit({ type: 'HOLD_DRAG_READY', tMs: snap.tMs });
          } else {
            // Emit hold progress for the 3s drag countdown (orange ring).
            const holdProgress = Math.min(snap.pinchHoldMs / this.holdDragMs, 1);
            this.emit({ type: 'HOLD_PROGRESS', tMs: snap.tMs, progress: holdProgress });
          }
        } else if (this.pressMode === 'drag') {
          // Stay in DRAGGING until pinch release — no mode-switching.
          this.state = 'DRAGGING';
          this.emit({ type: 'DRAG_MOVE', tMs: snap.tMs, x: snap.position.x, y: snap.position.y });
        }
        break;
      }

      case 'DRAGGING': {
        this.emit({ type: 'DRAG_MOVE', tMs: snap.tMs, x: snap.position.x, y: snap.position.y });
        break;
      }

      case 'HOLD_DRAG': {
        const cursorDelta = this.cursorDeltaSincePress(snap);
        // Pinch is reserved for drag/hold-drag only — no zoom transition.
        // Stay in HOLD_DRAG until either the cursor moves (→ HOLD_DRAGGING)
        // or the pinch releases (→ TRACKING/HOVERING).
        if (cursorDelta >= this.holdDragSensitivityPx) {
          this.state = 'HOLD_DRAGGING';
          this.holdDragLastMoveMs = snap.tMs;
          this.emit({ type: 'HOLD_DRAG_MOVE', tMs: snap.tMs, x: snap.position.x, y: snap.position.y });
        } else {
          // Continue hold countdown ring emission.
          const holdProgress = Math.min(snap.pinchHoldMs / this.holdDragMs, 1);
          this.emit({ type: 'HOLD_PROGRESS', tMs: snap.tMs, progress: holdProgress });
        }
        break;
      }

      case 'HOLD_DRAGGING': {
        const cursorDelta = this.cursorDeltaSincePress(snap);
        if (cursorDelta < this.holdDragSensitivityPx) {
          if (this.holdDragLastMoveMs !== null && snap.tMs - this.holdDragLastMoveMs >= this.holdDragPauseMs) {
            this.state = 'HOLD_DRAG';
          }
        } else {
          this.holdDragLastMoveMs = snap.tMs;
          this.emit({ type: 'HOLD_DRAG_MOVE', tMs: snap.tMs, x: snap.position.x, y: snap.position.y });
        }
        break;
      }

      case 'ZOOMING': {
        const scaleFactor = 1.0 - this.pinchDeltaAccum;
        this.emit({ type: 'ZOOM_UPDATE', tMs: snap.tMs, scaleFactor });
        break;
      }

      default:
        break;
    }

    return this.state;
  }

  private beginDwell(snap: PointerSnapshot): void {
    this.dwellStartMs = snap.tMs;
    this.dwellStartPosition = { ...snap.position };
    // Reset dwell-stability tracking so a new dwell starts with a clean slate.
    this.positionHistory = [{ x: snap.position.x, y: snap.position.y, tMs: snap.tMs }];
    this.consecutiveDriftFrames = 0;
  }

  private cancelDwell(): void {
    this.dwellStartMs = null;
    this.dwellStartPosition = null;
    // Don't wipe the history on cancel — the next beginDwell can reuse it as
    // warmup data if it comes quickly (within the 500 ms history window).
    this.consecutiveDriftFrames = 0;
  }

  private dwellDriftSinceStart(snap: PointerSnapshot): number {
    if (!this.dwellStartPosition) return 0;
    const dx = snap.position.x - this.dwellStartPosition.x;
    const dy = snap.position.y - this.dwellStartPosition.y;
    return Math.hypot(dx, dy);
  }

  private beginPress(snap: PointerSnapshot): void {
    this.pressStartMs = snap.tMs;
    this.pressStartPosition = { ...snap.position };
    this.holdDragLastMoveMs = null;
    this.pinchDeltaAccum = 0;
    this.pressMode = null;
    // Fire PINCH_START so the dispatcher can lock the drag target element
    // *immediately* on pinch — before the FSM decides whether this will
    // become a drag, zoom, or hold. This eliminates the "lag" felt between
    // pinching and the drag beginning to track the finger.
    this.emit({
      type: 'PINCH_START',
      tMs: snap.tMs,
      x: snap.position.x,
      y: snap.position.y,
    });
  }

  private cancelPress(): void {
    this.pressStartMs = null;
    this.pressStartPosition = null;
    this.holdDragLastMoveMs = null;
    this.pinchDeltaAccum = 0;
    this.pressMode = null;
  }

  /**
   * End an active press (pinch was released). Fires the appropriate final event
   * (DRAG_END / HOLD_DRAG_END / ZOOM_END) and transitions to TRACKING or HOVERING.
   * No CLICK is ever fired from a pinch release — CLICK only happens via DWELL.
   */
  private endPress(snap: PointerSnapshot): void {
    const endingState = this.state;

    // Fire the appropriate "end" event for the state we're leaving.
    switch (endingState) {
      case 'DRAGGING':
        this.emit({ type: 'DRAG_END', tMs: snap.tMs });
        break;
      case 'HOLD_DRAG':
      case 'HOLD_DRAGGING':
        this.emit({ type: 'HOLD_DRAG_END', tMs: snap.tMs });
        break;
      case 'ZOOMING':
        this.emit({ type: 'ZOOM_END', tMs: snap.tMs });
        break;
      case 'PRESSING':
      default:
        // Pure pinch without drag/zoom motion — no event, just release.
        // (CLICK is dwell-only.)
        break;
    }

    this.cancelPress();

    // After release, return to TRACKING/HOVERING (or restart DWELLING if still over target).
    if (snap.overTarget) {
      this.state = 'HOVERING';
    } else {
      this.state = 'TRACKING';
    }
  }

  private cursorDeltaSincePress(snap: PointerSnapshot): number {
    if (!this.pressStartPosition) return 0;
    const dx = snap.position.x - this.pressStartPosition.x;
    const dy = snap.position.y - this.pressStartPosition.y;
    return Math.hypot(dx, dy);
  }

  private emit(e: GestureEvent): void {
    if (
      e.type !== 'DWELL_PROGRESS' &&
      e.type !== 'HOLD_PROGRESS' &&
      e.type !== 'DRAG_MOVE' &&
      e.type !== 'HOLD_DRAG_MOVE' &&
      e.type !== 'ZOOM_UPDATE'
    ) {
      // eslint-disable-next-line no-console
      console.log('[GestureFSM] event:', e.type, 'at', e.tMs);
    }
    this.listeners.forEach((cb) => cb(e));
  }
}
