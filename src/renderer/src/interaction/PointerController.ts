import { OneEuroFilter } from '../gestures/smoothing/oneEuro.js';
import {
  getIndexFingertip,
  normalizeLandmark
} from './landmarkNormalizer.js';
import type { TrackedHand } from '@renderer/hand-tracking/types.js';
import type { CalibrationData } from '@shared/types/index.js';
import { pointerRef, usePointerStore } from '../stores/pointerStore.js';
import { getHandTracker } from '@renderer/hand-tracking/useHandTracking.js';

export interface PointerControllerOptions {
  mirror: boolean;
  calibration: CalibrationData | null;
  /** 0..1; mapped to OneEuro minCutoff/beta */
  smoothing: number;
  /** 0.5..2 multiplier on cursor delta before applying to viewport. */
  cursorSensitivity: number;
}

/**
 * PointerController subscribes to HandTracker frames, smooths the
 * index fingertip position, and updates both the ref-backed snapshot
 * (for high-frequency reads) and the Zustand store (for React subscribers).
 *
 * Enhancements for stability:
 * - Confidence-weighted smoothing: when hand confidence drops, increase smoothing
 * - Velocity-adaptive smoothing: when hand is moving fast, reduce smoothing
 * - Exponential smoothing overlay: additional EMA for extra stability
 */
import { pickPrimaryHand } from '@renderer/hand-tracking/parseResult.js';

export class PointerController {
  private filterX = new OneEuroFilter();
  private filterY = new OneEuroFilter();
  private opts: PointerControllerOptions;
  private unsubscribe: (() => void) | null = null;
  
  /** Cursor deadband in px — movements smaller than this are suppressed. */
  private deadbandPx = 1.5;
  
  /** Low-confidence threshold below which we increase smoothing. */
  private lowConfidenceThreshold = 0.7;
  
  /** Minimum smoothing multiplier when confidence is low. */
  private minSmoothingBoost = 1.5;
  
  /** Maximum smoothing multiplier when confidence is very low. */
  private maxSmoothingBoost = 3.0;
  
  /** Velocity smoothing: EMA alpha for velocity calculation (higher = faster response). */
  private velocityAlpha = 0.3;
  
  /** Previous filtered position for velocity calculation. */
  private prevFilteredX = 0;
  private prevFilteredY = 0;
  private prevTimestamp = 0;
  
  /** Current smoothed velocity magnitude. */
  private currentVelocity = 0;
  
  /** Velocity threshold above which we reduce smoothing (for responsive drag). */
  private velocityThresholdHigh = 50;
  
  /** Velocity threshold below which we increase smoothing (for stability). */
  private velocityThresholdLow = 10;
  
  /** Extra EMA overlay for additional stability (applied after OneEuro). */
  private emaAlpha = 0.6; // Higher = more weight on new values, lower = smoother
  private emaX = 0;
  private emaY = 0;
  private emaInitialized = false;

  constructor(opts: PointerControllerOptions) {
    this.opts = opts;
    this.configureFilters();
  }

  configure(opts: PointerControllerOptions): void {
    this.opts = opts;
    this.configureFilters();
  }

  /**
   * Calculate smoothing multiplier based on hand confidence.
   * When confidence is low, increase smoothing to reduce jitter.
   */
  private getConfidenceSmoothingMultiplier(confidence: number): number {
    if (confidence >= this.lowConfidenceThreshold) {
      return 1.0; // Normal smoothing
    }
    // Linear interpolation from minBoost to maxBoost as confidence goes from lowThreshold to 0
    const ratio = 1 - (confidence / this.lowConfidenceThreshold);
    return this.minSmoothingBoost + ratio * (this.maxSmoothingBoost - this.minSmoothingBoost);
  }

  /**
   * Calculate smoothing multiplier based on velocity.
   * Fast movement = less smoothing (responsive)
   * Slow movement = more smoothing (stable)
   */
  private getVelocitySmoothingMultiplier(velocity: number): number {
    if (velocity >= this.velocityThresholdHigh) {
      return 0.5; // Fast movement - reduce smoothing for responsiveness
    }
    if (velocity <= this.velocityThresholdLow) {
      return 1.5; // Slow/stable - increase smoothing for stability
    }
    // Linear interpolation between thresholds
    const range = this.velocityThresholdHigh - this.velocityThresholdLow;
    const ratio = (this.velocityThresholdHigh - velocity) / range;
    return 0.5 + ratio;
  }

  private configureFilters(baseConfidence = 1.0, velocity = 0): void {
    // Base smoothing from user setting
    const t = this.opts.smoothing;
    const baseMinCutoff = 0.3 + t * 2.7;
    const baseBeta = t * t * 0.04;

    // Apply confidence boost
    const confMult = this.getConfidenceSmoothingMultiplier(baseConfidence);
    const velMult = this.getVelocitySmoothingMultiplier(velocity);
    const totalMult = confMult * velMult;

    // Higher minCutoff = smoother (less jitter)
    const minCutoff = baseMinCutoff * totalMult;
    // Higher beta = less lag during fast motion
    const beta = baseBeta / Math.sqrt(totalMult);

    this.filterX.setMinCutoff(minCutoff);
    this.filterX.setBeta(beta);
    this.filterY.setMinCutoff(minCutoff);
    this.filterY.setBeta(beta);
  }

  start(): void {
    if (this.unsubscribe) return;
    const tracker = getHandTracker();
    this.unsubscribe = tracker.onFrame((frame) => this.onFrame(frame));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    pointerRef.visible = false;
    usePointerStore.getState().setVisible(false);
    // Reset filters when stopping
    this.filterX = new OneEuroFilter();
    this.filterY = new OneEuroFilter();
    this.emaInitialized = false;
    this.currentVelocity = 0;
    this.prevTimestamp = 0;
    this.configureFilters();
  }

  private onFrame(frame: { hands: ReadonlyArray<TrackedHand>; timestampMs: number }): void {
    const hand = pickPrimaryHand([...frame.hands]);
    if (!hand) {
      this.handleLostHand();
      return;
    }

    const tip = getIndexFingertip(hand);
    if (!tip) {
      this.handleLostHand();
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const screen = normalizeLandmark(tip, {
      viewportWidth,
      viewportHeight,
      mirror: this.opts.mirror,
      calibration: this.opts.calibration
    });

    const xRaw = screen.x;
    const yRaw = screen.y;

    // Calculate current velocity from previous filtered position
    const dt = this.prevTimestamp > 0 
      ? Math.max(1, frame.timestampMs - this.prevTimestamp) / 1000 
      : 0.033; // Default ~30fps
    const rawVelX = this.prevFilteredX !== 0 ? (xRaw - this.prevFilteredX) / dt : 0;
    const rawVelY = this.prevFilteredY !== 0 ? (yRaw - this.prevFilteredY) / dt : 0;
    const rawVelocity = Math.hypot(rawVelX, rawVelY);
    
    // EMA smoothing on velocity to avoid sudden jumps
    this.currentVelocity = this.currentVelocity * (1 - this.velocityAlpha) + rawVelocity * this.velocityAlpha;
    
    // Update filter parameters based on confidence and velocity
    this.configureFilters(hand.score, this.currentVelocity);

    // Apply OneEuro filter
    const xFiltered = this.filterX.filter(xRaw, frame.timestampMs);
    const yFiltered = this.filterY.filter(yRaw, frame.timestampMs);
    
    // Store for next frame's velocity calculation
    this.prevFilteredX = xFiltered;
    this.prevFilteredY = yFiltered;
    this.prevTimestamp = frame.timestampMs;

    // Apply additional EMA overlay for extra stability
    // Lower alpha = smoother but more lag
    if (!this.emaInitialized) {
      this.emaX = xFiltered;
      this.emaY = yFiltered;
      this.emaInitialized = true;
    }
    this.emaX = this.emaX * (1 - this.emaAlpha) + xFiltered * this.emaAlpha;
    this.emaY = this.emaY * (1 - this.emaAlpha) + yFiltered * this.emaAlpha;

    // Apply sensitivity multiplier on the delta from last frame so the cursor
    // stays anchored to the same place when sensitivity = 1.
    const prevX = pointerRef.position.x;
    const prevY = pointerRef.position.y;
    
    // Use EMA smoothed position for the final output
    const xWithSensitivity = prevX + (this.emaX - prevX) * this.opts.cursorSensitivity;
    const yWithSensitivity = prevY + (this.emaY - prevY) * this.opts.cursorSensitivity;

    // Deadband: if the movement is tiny (< deadbandPx), snap to previous
    // position. This kills the tremor jitter without affecting intentional motion.
    const dx = this.emaX - prevX;
    const dy = this.emaY - prevY;
    const dist = Math.hypot(dx, dy);
    const xOut = dist > this.deadbandPx ? xWithSensitivity : prevX;
    const yOut = dist > this.deadbandPx ? yWithSensitivity : prevY;

    pointerRef.position = { x: xOut, y: yOut };
    pointerRef.visible = true;
    pointerRef.confidence = hand.score;

    usePointerStore.getState().setPosition(pointerRef.position);
    usePointerStore.getState().setVisible(true);
    usePointerStore.getState().setConfidence(hand.score);
  }

  private handleLostHand(): void {
    pointerRef.visible = false;
    usePointerStore.getState().setVisible(false);
  }
}

let _controller: PointerController | null = null;
export function getPointerController(opts?: PointerControllerOptions): PointerController {
  if (!_controller) {
    _controller = new PointerController(
      opts ?? {
        mirror: true,
        calibration: null,
        smoothing: 0.5,
        cursorSensitivity: 1.0
      }
    );
    _controller.start();
  } else if (opts) {
    _controller.configure(opts);
  }
  return _controller;
}

export function usePointerVisible(): boolean {
  return usePointerStore((s) => s.visible);
}