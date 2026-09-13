import { PinchDetector } from './PinchDetector.js';
import { GestureFSM, type GestureEvent } from './stateMachine.js';
import {
  HandDepthZoomDetector,
  HAND_DEPTH_ZOOM_CONFIG,
  createHandDepthZoomDetector
} from './HandDepthZoomDetector.js';
import { getHandTracker } from '@renderer/hand-tracking/useHandTracking.js';
import { pointerRef } from '@renderer/stores/pointerStore.js';
import { pickPrimaryHand } from '@renderer/hand-tracking/parseResult.js';
import { useGestureStore } from '@renderer/stores/gestureStore.js';
import { useWindowStore } from '@renderer/stores/windowsStore.js';
import { useSettingsStore } from '@renderer/stores/settingsStore.js';
import type { HandFrame, TrackedHand } from '@renderer/hand-tracking/types.js';
import { isHandFullyOpen } from './handPoseUtils.js';

export interface GestureEngineOptions {
  /** ms the cursor must rest over a target to fire a CLICK (dwell). */
  dwellMs?: number;
  /** px of cursor drift allowed during dwell before the timer resets. */
  dwellJitterPx?: number;
  /** px of cursor movement required to start DRAGGING while pressing. */
  dragPx?: number;
  /** ms of continuous pinch required to enter HOLD_DRAG mode. */
  holdDragMs?: number;
  /** px of cursor movement required to start HOLD_DRAGGING once hold is armed. */
  holdDragSensitivityPx?: number;
  /** pinch sensitivity for PinchDetector (lower = more lenient). */
  pinchSensitivity?: number;
  /** Min/max zoom scale factors. */
  zoomMin?: number;
  zoomMax?: number;
  /** Multiplier applied per discrete ZOOM_IN step (default 1.25 = +25%). */
  zoomStepIn?: number;
  /** Multiplier applied per discrete ZOOM_OUT step (default 0.85 = -15%). */
  zoomStepOut?: number;
  /** Warmup ms during which drift checks are skipped (default 150). */
  dwellWarmupMs?: number;
  /** Consecutive drift frames needed to cancel dwell (default 3). */
  dwellConsecFramesToCancel?: number;
  /** Threshold growth multiplier toward end of dwell (default 2.0). */
  dwellAdaptiveGrowth?: number;
  /** Grace ms for overTarget flicker prevention (default 60). */
  dwellTargetGraceMs?: number;
}

/**
 * GestureEngine glues together:
 *   - HandTracker  (frames)
 *   - PointerController (smoothed cursor position)
 *   - PinchDetector  (hysteresis for 2-finger pinch → drag)
 *   - HandDepthZoomDetector (continuous depth-driven zoom)
 *   - GestureFSM  (state transitions + events)
 *
 * Two-finger pinch is reserved for DRAG and explicitly FREEZES the depth
 * zoom while it's active. Once the pinch ends, zoom resumes from where
 * it was. This satisfies the user requirement: "tay chụm sẽ chỉ only
 * là drag, còn zoom thì cứ để 5 ngón tay trước màn hình và zoom out in
 * bằng cách để gần xa".
 *
 * The depth zoom itself is continuous (not stepped): the scale is a
 * smooth function of (current_palm_depth / baseline_palm_depth), so the
 * user's hand motion maps directly to window scale. Internal EMA
 * smoothing and a per-frame change limit keep the result visually
 * stable — no "tránh nhảy tùm lum".
 *
 * The engine is the single source of truth for gesture state.
 * Subscribers read from useGestureStore; components consume the FSM via
 * the useGestureState() hook.
 */
/**
 * Zoom activation state machine.
 *
 * Default = IDLE: click/drag work normally, depth zoom does NOTHING.
 * User must explicitly hold an open palm (all 5 fingers extended) steady
 * for armingMs → ZOOM_ARMED: depth zoom is now active.
 *
 * Exit ZOOM_ARMED when:
 *   - User starts pinching (drag intent) → back to IDLE
 *   - Hand lost for >800ms → back to IDLE
 *   - Hand pose changes (no longer open) → back to IDLE
 *   - Idle timeout (no zoom activity for 10s) → back to IDLE
 */
type ZoomActivationPhase = 'IDLE' | 'ARMING' | 'ARMED';

/**
 * Standard zoom activation tuning:
 *  - armingMs (1500): hold open palm still for 1.5s to activate zoom.
 *    This prevents accidental activation while keeping the wait short enough
 *    to not feel tedious.
 *  - idleTimeoutMs (12000): if zoom is armed but the user hasn't moved
 *    their hand at all (no depth change) for 12s, deactivate. This
 *    prevents the zoom from being permanently stuck on.
 */
export const ZOOM_ACTIVATION_CONFIG = {
  armingMs: 1500,
  idleTimeoutMs: 12000
};

export class GestureEngine {
  private pinch: PinchDetector;
  private handDepthZoom: HandDepthZoomDetector;
  private fsm: GestureFSM;
  private opts: Required<GestureEngineOptions>;
  private unsubscribe: (() => void) | null = null;

  // ── Zoom activation tracking ────────────────────────────────────────────
  /** Current zoom activation phase. */
  private zoomPhase: ZoomActivationPhase = 'IDLE';
  /** Timestamp (ms) when current ARMING began, or 0 if not arming. */
  private zoomArmingStartedAt = 0;
  /** Timestamp (ms) of the last frame that actually produced a zoom change. */
  private lastZoomActivityAt = 0;
  /** Consecutive frames the hand has been open AND still (for ARMING timer). */
  private zoomArmingFrames = 0;
  /** Grace frames when pose fails during ARMING (tolerates brief detection glitches). */
  private zoomArmingGraceFrames = 0;
    /** Grace frames when pose fails during ARMED state. */
  private zoomArmedGraceFrames = 0;
  private static readonly ZOOM_ARMED_GRACE_FRAMES = 8; // tolerate 8 bad frames during zoom (ARMED)
  /** Previous hand position for stillness check during ARMING. */
  private zoomArmingPrevX = 0;
  private zoomArmingPrevY = 0;

  constructor(opts: GestureEngineOptions = {}) {
    this.opts = {
      dwellMs: opts.dwellMs ?? 800,
      dwellJitterPx: opts.dwellJitterPx ?? 6,
      dragPx: opts.dragPx ?? 6,
      holdDragMs: opts.holdDragMs ?? 3000,
      holdDragSensitivityPx: opts.holdDragSensitivityPx ?? 4,
      pinchSensitivity: opts.pinchSensitivity ?? 0.5,
      // Symmetric zoom magnitudes: 1.20 in (+20%), 1/1.20 ≈ 0.833 out (≈ -17%).
      // Both directions feel the same, neither feels "spammy". Multiplicative
      // inverse keeps the user's mental model symmetric: a zoom-in followed
      // by a zoom-out returns to the original size.
      zoomMin: opts.zoomMin ?? 0.4,
      zoomMax: opts.zoomMax ?? 2.5,
      zoomStepIn: opts.zoomStepIn ?? 1.20,
      zoomStepOut: opts.zoomStepOut ?? 1 / 1.20,
      dwellWarmupMs: opts.dwellWarmupMs ?? 250,
      dwellConsecFramesToCancel: opts.dwellConsecFramesToCancel ?? 3,
      dwellAdaptiveGrowth: opts.dwellAdaptiveGrowth ?? 2.0,
      dwellTargetGraceMs: opts.dwellTargetGraceMs ?? 250
    };
    this.pinch = new PinchDetector({ sensitivity: this.opts.pinchSensitivity });
    this.handDepthZoom = createHandDepthZoomDetector();
    this.fsm = new GestureFSM({
      dwellMs: this.opts.dwellMs,
      dwellJitterPx: this.opts.dwellJitterPx,
      dragPx: this.opts.dragPx,
      holdDragMs: this.opts.holdDragMs,
      holdDragSensitivityPx: this.opts.holdDragSensitivityPx,
      dwellWarmupMs: this.opts.dwellWarmupMs,
      dwellConsecFramesToCancel: this.opts.dwellConsecFramesToCancel,
      dwellAdaptiveGrowth: this.opts.dwellAdaptiveGrowth,
      dwellTargetGraceMs: this.opts.dwellTargetGraceMs
    });
    this.fsm.onEvent((e) => this.onEvent(e));
  }

  start(): void {
    if (this.unsubscribe) return;
    const tracker = getHandTracker();
    this.unsubscribe = tracker.onFrame((f) => this.onFrame(f));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  configure(opts: GestureEngineOptions): void {
    if (opts.dwellMs !== undefined) {
      this.opts.dwellMs = opts.dwellMs;
      this.fsm.configure({ dwellMs: opts.dwellMs });
    }
    if (opts.dwellJitterPx !== undefined) {
      this.opts.dwellJitterPx = opts.dwellJitterPx;
      this.fsm.configure({ dwellJitterPx: opts.dwellJitterPx });
    }
    if (opts.dragPx !== undefined) {
      this.opts.dragPx = opts.dragPx;
      this.fsm.configure({ dragPx: opts.dragPx });
    }
    if (opts.holdDragMs !== undefined) {
      this.opts.holdDragMs = opts.holdDragMs;
      this.fsm.configure({ holdDragMs: opts.holdDragMs });
    }
    if (opts.holdDragSensitivityPx !== undefined) {
      this.opts.holdDragSensitivityPx = opts.holdDragSensitivityPx;
      this.fsm.configure({ holdDragSensitivityPx: opts.holdDragSensitivityPx });
    }
    if (opts.dwellWarmupMs !== undefined) {
      this.opts.dwellWarmupMs = opts.dwellWarmupMs;
      this.fsm.configure({ dwellWarmupMs: opts.dwellWarmupMs });
    }
    if (opts.dwellConsecFramesToCancel !== undefined) {
      this.opts.dwellConsecFramesToCancel = opts.dwellConsecFramesToCancel;
      this.fsm.configure({ dwellConsecFramesToCancel: opts.dwellConsecFramesToCancel });
    }
    if (opts.dwellAdaptiveGrowth !== undefined) {
      this.opts.dwellAdaptiveGrowth = opts.dwellAdaptiveGrowth;
      this.fsm.configure({ dwellAdaptiveGrowth: opts.dwellAdaptiveGrowth });
    }
    if (opts.dwellTargetGraceMs !== undefined) {
      this.opts.dwellTargetGraceMs = opts.dwellTargetGraceMs;
      this.fsm.configure({ dwellTargetGraceMs: opts.dwellTargetGraceMs });
    }
    if (opts.pinchSensitivity !== undefined) {
      this.opts.pinchSensitivity = opts.pinchSensitivity;
      this.pinch.setSensitivity(opts.pinchSensitivity);
    }
    if (opts.zoomMin !== undefined) {
      this.opts.zoomMin = opts.zoomMin;
    }
    if (opts.zoomMax !== undefined) {
      this.opts.zoomMax = opts.zoomMax;
    }
    if (opts.zoomStepIn !== undefined) {
      this.opts.zoomStepIn = opts.zoomStepIn;
    }
    if (opts.zoomStepOut !== undefined) {
      this.opts.zoomStepOut = opts.zoomStepOut;
    }
  }

  /** For external subscribers (InteractionDispatcher). */
  getFsm(): GestureFSM {
    return this.fsm;
  }

  private onFrame(frame: HandFrame): void {
    const hand: TrackedHand | null = pickPrimaryHand([...frame.hands]);
    const pointerVisible = pointerRef.visible;
    const settings = useSettingsStore.getState();
    const zoomEnabled = settings.tracking.pinchZoomEnabled;

    // ── 1) Pinch first ──────────────────────────────────────────────────
    //    We need pinch state to know whether to FREEZE zoom (tay chụm = only drag).
    const pinchResult = this.pinch.update(hand, frame.timestampMs);
    const pinchNorm = pinchResult.distanceNorm;
    useGestureStore.getState().setPinchState(pinchResult.state);
    useGestureStore.getState().setPinchDistance(pinchNorm);
    const isPinching =
      pinchResult.state === 'PINCH_START' || pinchResult.state === 'PINCH_HOLD';

    // ── 2) Zoom activation state machine ───────────────────────────────
    //    Default: IDLE (no zoom activity). User must explicitly hold
    //    an open palm steady for armingMs to enter ARMED state.
    //
    //    The intent is: normal hand movement → click/drag works freely.
    //    Only when the user CHOSE to hold 5 fingers up and stay still,
    //    does zoom kick in.
    this.updateZoomActivation(hand, isPinching, frame.timestampMs, zoomEnabled);

    // ── 3) Depth-driven zoom — only runs when ARMED ─────────────────
    //    If zoom is not enabled or not activated, the detector still
    //    receives hand data (to keep its internal state warm for the
    //    next activation), but it returns null and makes no changes.
    const winState = useWindowStore.getState();
    const focusedId = winState.focusedId;
    const w = focusedId ? winState.windows[focusedId] : null;

    // Always run the depth detector while ARMED so Space/3D worlds
    // (which read zoomFactor + zoomPhase from the gesture store) also
    // react, even when there is no focused window in the store.
    const baselineScaleForStore = w?.scale ?? 1.0;
    const newScale = this.handDepthZoom.update(
      hand,
      isPinching,
      frame.timestampMs,
      baselineScaleForStore,
      this.opts.zoomMin,
      this.opts.zoomMax
    );

    if (zoomEnabled && this.zoomPhase === 'ARMED') {
      // Publish zoomFactor for ALL consumers (Space world + debug overlay)
      // every frame — Space uses it to drive camera distance.
      if (newScale !== null) {
        useGestureStore.getState().setZoomFactor(newScale, focusedId);
        this.lastZoomActivityAt = frame.timestampMs;
      } else {
        // Even with null, keep zoomFactor published so subscribers
        // re-render with current scale (e.g. freeze).
        useGestureStore.getState().setZoomFactor(
          baselineScaleForStore,
          focusedId
        );
      }

      // Apply to focused window if there is one (skip native content).
      if (newScale !== null && focusedId && w && !w.hasNativeContent && !w.isMinimized) {
        winState.setScale(focusedId, newScale, this.opts.zoomMin, this.opts.zoomMax);
      }
    }

    // ── 3.5) Debug overlay: report zoom activation phase ─────────────
    useGestureStore.getState().setZoomPhase(
      this.zoomPhase === 'ARMED' ? 'TRACKING' :
      this.zoomPhase === 'ARMING' ? 'COOLDOWN' : 'IDLE',
      0, 0
    );

    // ── 4) Detect if cursor is over a clickable element ─────────────
    const p = pointerRef.position;
    const el = document.elementFromPoint(p.x, p.y);
    const overTarget = this.isInteractiveElement(el);

    // ── 5) FSM snapshot — pinch/dwell/drag unaffected by zoom state ───
    const snap = {
      position: p,
      overTarget,
      handVisible: pointerVisible && !!hand,
      pinchState: pinchResult.state,
      pinchHoldMs: pinchResult.holdMs,
      pinchDelta: pinchResult.state === 'PINCH_HOLD' ? pinchNorm - (this.lastNorm ?? pinchNorm) : 0,
      tMs: frame.timestampMs
    };
    const next = this.fsm.update(snap);
    useGestureStore.getState().setFsmState(next);
    this.lastNorm = pinchNorm;
  }

  private lastNorm: number | null = null;

  /**
   * Zoom activation state machine.
   *
   * Transitions:
   *   IDLE → ARMING: hand is FULLY OPEN (5 fingers clearly extended, strict
   *                   pose check), no pinch, hand is still.
   *   ARMING → ARMED: held the full armingMs continuously (default 1.5s).
   *                   If at ANY point during arming the pose breaks or
   *                   the hand moves, the timer RESETS to 0. The user
   *                   must hold the pose for the entire duration with no
   *                   interruption.
   *   ARMED → IDLE: hand lost, pinch starts, pose changes, or idle timeout.
   *   ARMING → IDLE: hand lost, pinch starts, or pose clearly broken.
   *
   * Strict pose criteria (see isHandFullyOpen):
   *   - All 4 non-thumb fingertips ≥ 55% × palm_size from palm center
   *   - All 4 fingers at similar extension levels (≥ 65% of max)
   *   - Thumb tip ≥ 55% × palm_size from index MCP (i.e. not curled)
   *   - Hand confidence score ≥ 0.5
   */
  private updateZoomActivation(
    hand: TrackedHand | null,
    isPinching: boolean,
    tMs: number,
    zoomEnabled: boolean
  ): void {
    // ── Case: zoom disabled → always IDLE ──────────────────────────
    if (!zoomEnabled) {
      if (this.zoomPhase !== 'IDLE') {
        this.zoomPhase = 'IDLE';
        this.zoomArmingFrames = 0;
        this.zoomArmingGraceFrames = 0;
        this.zoomArmedGraceFrames = 0;
        this.zoomArmingStartedAt = 0;
        this.handDepthZoom.reset();
        // eslint-disable-next-line no-console
        console.log('[GestureEngine] zoom disabled → IDLE');
      }
      return;
    }

    // ── Case: no hand or pinching → exit any active phase ─────────
    if (!hand || isPinching) {
      if (this.zoomPhase !== 'IDLE') {
        this.zoomPhase = 'IDLE';
        this.zoomArmingFrames = 0;
        this.zoomArmingGraceFrames = 0;
        this.zoomArmedGraceFrames = 0;
        this.zoomArmingStartedAt = 0;
        // eslint-disable-next-line no-console
        console.log('[GestureEngine] zoom → IDLE (hand lost or pinch started)');
      }
      return;
    }

    // ── Case: idle timeout while ARMED → return to IDLE ────────────
    if (this.zoomPhase === 'ARMED') {
      if (
        this.lastZoomActivityAt > 0 &&
        tMs - this.lastZoomActivityAt > ZOOM_ACTIVATION_CONFIG.idleTimeoutMs
      ) {
        this.zoomPhase = 'IDLE';
        this.zoomArmingFrames = 0;
        this.zoomArmingGraceFrames = 0;
        this.zoomArmedGraceFrames = 0;
        this.zoomArmingStartedAt = 0;
        this.handDepthZoom.reset();
        // eslint-disable-next-line no-console
        console.log('[GestureEngine] zoom → IDLE (idle timeout)');
        return;
      }
      // Stay ARMED — but monitor pose with grace tolerance
      if (!isHandFullyOpen(hand)) {
        this.zoomArmedGraceFrames++;
        if (this.zoomArmedGraceFrames >= GestureEngine.ZOOM_ARMED_GRACE_FRAMES) {
          this.zoomPhase = 'IDLE';
          this.zoomArmingFrames = 0;
          this.zoomArmingGraceFrames = 0;
          this.zoomArmedGraceFrames = 0;
          this.zoomArmingStartedAt = 0;
          this.handDepthZoom.reset();
          // eslint-disable-next-line no-console
          console.log('[GestureEngine] zoom → IDLE (pose broken during ARMED, grace exhausted)');
        }
      } else {
        // Pose good → reset grace
        this.zoomArmedGraceFrames = 0;
      }
      return;
    }

    // ── Pose check ────────────────────────────────────────────────
    //   Use a lenient pose check during ARMING to tolerate brief
    //   detection glitches. Require hand to be mostly open.
    const handIsOpen = isHandFullyOpen(hand);
    if (!handIsOpen) {
      // Pose NOT fully open → not eligible for zoom.
      if (this.zoomPhase === 'ARMING') {
        // During arming: consume one grace frame instead of resetting
        this.zoomArmingGraceFrames++;
        if (this.zoomArmingGraceFrames >= GestureEngine.ZOOM_ARMING_GRACE_FRAMES) {
          // Grace exhausted → give up
          this.zoomPhase = 'IDLE';
          this.zoomArmingFrames = 0;
          this.zoomArmingGraceFrames = 0;
          this.zoomArmedGraceFrames = 0;
          this.zoomArmingStartedAt = 0;
          // eslint-disable-next-line no-console
          console.log('[GestureEngine] zoom → IDLE (pose not fully open, grace exhausted)');
        }
        // else: stay in ARMING, wait for pose to recover
      } else if (this.zoomPhase !== 'IDLE') {
        this.zoomPhase = 'IDLE';
        this.zoomArmingFrames = 0;
        this.zoomArmingGraceFrames = 0;
        this.zoomArmedGraceFrames = 0;
        this.zoomArmingStartedAt = 0;
        // eslint-disable-next-line no-console
        console.log('[GestureEngine] zoom → IDLE (pose not fully open)');
      }
      return;
    }
    // Pose good → reset grace counter
    this.zoomArmingGraceFrames = 0;

    // ── Stillness check ────────────────────────────────────────────
    //   Use index MCP as a stable proxy for hand position. Require the
    //   hand to stay roughly in the same place (~3% screen/frame) for
    //   the entire arming duration.
    const indexMcp = hand.landmarks[5]; // LANDMARK.INDEX_MCP
    if (!indexMcp) return;

    // First frame of a candidate arming: initialize tracking position.
    if (this.zoomArmingFrames === 0) {
      this.zoomArmingPrevX = indexMcp.x;
      this.zoomArmingPrevY = indexMcp.y;
    }
    const dx = indexMcp.x - this.zoomArmingPrevX;
    const dy = indexMcp.y - this.zoomArmingPrevY;
    this.zoomArmingPrevX = indexMcp.x;
    this.zoomArmingPrevY = indexMcp.y;
    const isStill = Math.hypot(dx, dy) < 0.03; // ~3% screen / frame

    if (!isStill) {
      // Moved while arming — reset timer entirely. User must hold STILL
      // for the full armingMs, not just "mostly still".
      this.zoomArmingFrames = 0;
      this.zoomArmingGraceFrames = 0;
      this.zoomArmedGraceFrames = 0;
      this.zoomArmingStartedAt = 0;
      if (this.zoomPhase === 'ARMING') {
        this.zoomPhase = 'IDLE';
        // eslint-disable-next-line no-console
        console.log('[GestureEngine] arming RESET (hand moved)');
      }
      return;
    }

    this.zoomArmingFrames++;

    // ── Start (or continue) arming timer ───────────────────────────
    if (this.zoomArmingStartedAt === 0) {
      // Starting a brand-new arming sequence
      this.zoomArmingStartedAt = tMs;
      this.zoomArmingFrames = 0;
      this.zoomArmingGraceFrames = 0;
      this.zoomArmedGraceFrames = 0;
      this.zoomArmingPrevX = indexMcp.x;
      this.zoomArmingPrevY = indexMcp.y;
      if (this.zoomPhase !== 'ARMING') {
        this.zoomPhase = 'ARMING';
        // eslint-disable-next-line no-console
        console.log('[GestureEngine] zoom → ARMING (5-finger open + still — hold for 1.5s)');
      }
    }

    // ── Check if arming duration met ───────────────────────────────
    if (this.zoomPhase === 'ARMING') {
      const armingElapsed = tMs - this.zoomArmingStartedAt;
      if (armingElapsed >= ZOOM_ACTIVATION_CONFIG.armingMs) {
        // Promote to ARMED — depth zoom now active!
        this.zoomPhase = 'ARMED';
        this.zoomArmingFrames = 0;
        this.zoomArmingStartedAt = 0;
        this.lastZoomActivityAt = tMs;
        this.handDepthZoom.reset(); // fresh baseline on activation
        // eslint-disable-next-line no-console
        console.log('[GestureEngine] zoom → ARMED! Continuous depth zoom active. Push/pull to scale.');
      }
    }
  }

  /** Hook for "reset scale" UI: tells the depth zoom to re-capture baseline. */
  onZoomReset(): void {
    this.handDepthZoom.onScaleReset();
    this.zoomPhase = 'IDLE';
    this.zoomArmingFrames = 0;
    this.zoomArmingGraceFrames = 0;
    this.zoomArmedGraceFrames = 0;
    this.zoomArmingStartedAt = 0;
  }

  /**
   * Walk up the ancestor chain so the cursor counts as "over a target"
   * when hovering over a child element of a button (e.g. a glyph <span>
   * inside a <button>). Without this, cursor jitter at the edge of a
   * small interactive element cancels the dwell continuously.
   */
  private isInteractiveElement(el: Element | null): boolean {
    let cur: Element | null = el;
    let depth = 0;
    while (cur && depth < 8) {
      const tag = cur.tagName.toLowerCase();
      if (
        tag === 'button' ||
        tag === 'a' ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        cur.hasAttribute('onclick') ||
        cur.getAttribute('role') === 'button'
      ) {
        return true;
      }
      const style = window.getComputedStyle(cur);
      if (style.cursor === 'pointer') return true;
      if (cur.hasAttribute('data-interactive')) return true;
      cur = cur.parentElement;
      depth++;
    }
    return false;
  }

  private onEvent(e: GestureEvent): void {
    useGestureStore.getState().pushEvent(e);
    // Forward hold-drag armed signal to the store for cursor icon switching.
    if (e.type === 'HOLD_DRAG_READY') {
      useGestureStore.getState().setHoldDragArmed(true);
    }
    if (e.type === 'HOLD_DRAG_END' || e.type === 'LOST') {
      useGestureStore.getState().setHoldDragArmed(false);
    }
    // NOTE: No zoom lockout needed with depth-based zoom. Drag uses
    // thumb-index distance; zoom uses palm depth (Z-axis). These are
    // independent signals that cannot fight each other.
  }
}

let _engine: GestureEngine | null = null;
export function getGestureEngine(): GestureEngine {
  if (!_engine) {
    _engine = new GestureEngine();
    _engine.start();
  }
  return _engine;
}

/** Reset singleton — used by tests and after settings changes that warrant a fresh engine. */
export function resetGestureEngine(): void {
  _engine?.stop();
  _engine = null;
}

