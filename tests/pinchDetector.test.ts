import { describe, it, expect } from 'vitest';
import { PinchDetector } from '@renderer/gestures/PinchDetector.js';
import type { TrackedHand, NormalizedLandmark } from '@renderer/hand-tracking/types.js';
import { LANDMARK } from '@renderer/hand-tracking/types.js';

function makeHand(thumbToIndex: number, score = 0.9): TrackedHand {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  landmarks[LANDMARK.WRIST] = { x: 0.5, y: 0.9, z: 0 };
  landmarks[LANDMARK.MIDDLE_MCP] = { x: 0.5, y: 0.5, z: 0 };
  // Place thumb and index at given distance.
  landmarks[LANDMARK.THUMB_TIP] = { x: 0.5 + thumbToIndex, y: 0.5, z: 0 };
  landmarks[LANDMARK.INDEX_TIP] = { x: 0.5, y: 0.5, z: 0 };
  return { handedness: 'Right', score, landmarks, worldLandmarks: [] };
}

describe('PinchDetector', () => {
  it('starts OPEN', () => {
    const d = new PinchDetector();
    expect(d.getState()).toBe('OPEN');
  });

  it('transitions OPEN -> PINCH_START when below start threshold', () => {
    const d = new PinchDetector();
    // palmSize = 0.4, so distance 0.1 -> normalized = 0.25 (below 0.35).
    const result = d.update(makeHand(0.1), 1000);
    expect(result.state).toBe('PINCH_START');
    expect(result.holdMs).toBe(0); // not yet in PINCH_HOLD frame
  });

  it('stays OPEN above start threshold', () => {
    const d = new PinchDetector();
    // distance 0.4 -> normalized = 1.0 (above 0.35).
    const result = d.update(makeHand(0.4), 1000);
    expect(result.state).toBe('OPEN');
  });

  it('transitions PINCH_START -> PINCH_HOLD on next frame', () => {
    const d = new PinchDetector();
    d.update(makeHand(0.1), 1000);
    const result = d.update(makeHand(0.1), 1033);
    expect(result.state).toBe('PINCH_HOLD');
    // holdMs is 0 on the frame we enter PINCH_HOLD (transition frame)
    expect(result.holdMs).toBe(0);
    // holdMs accumulates on subsequent frames
    const later = d.update(makeHand(0.1), 1100);
    expect(later.state).toBe('PINCH_HOLD');
    expect(later.holdMs).toBe(67);
  });

  it('releases only when distance exceeds release threshold (hysteresis)', () => {
    const d = new PinchDetector();
    d.update(makeHand(0.1), 1000);
    d.update(makeHand(0.1), 1033);
    // 0.4 - 0.5 = -0.1 → normalized = 0.25 (still below release 0.55).
    const still = d.update(makeHand(0.1), 1066);
    expect(still.state).toBe('PINCH_HOLD');
    // 0.3 - 0.5 = -0.2 → normalized = 0.5 (still below release 0.55).
    const still2 = d.update(makeHand(0.2), 1100);
    expect(still2.state).toBe('PINCH_HOLD');
    // 0.5 - 0.5 = 0 → normalized = 1.25 (well above release).
    const released = d.update(makeHand(0.5), 1133);
    expect(released.state).toBe('PINCH_RELEASE');
    expect(released.holdMs).toBe(0); // cleared after leaving PINCH_HOLD
  });

  it('rejects low-confidence hands', () => {
    const d = new PinchDetector();
    const result = d.update(makeHand(0.1, 0.1), 1000);
    expect(result.state).toBe('OPEN');
    expect(result.holdMs).toBe(0);
  });

  it('static distanceNorm is reported via getLastDistanceNorm', () => {
    const d = new PinchDetector();
    d.update(makeHand(0.1), 1000);
    expect(d.getLastDistanceNorm()).toBeGreaterThan(0);
  });

  it('sensitivity adjusts the start threshold', () => {
    // 0.0 widens -> start=0.45; 1.0 narrows -> start=0.25
    const loose = new PinchDetector({ sensitivity: 0 });
    const strict = new PinchDetector({ sensitivity: 1 });
    // distance 0.2 (palmSize 0.4) -> normalized 0.5 -> above loose.start (0.45) -> OPEN
    expect(loose.update(makeHand(0.2), 1000).state).toBe('OPEN');
    // distance 0.08 (normalized 0.2) -> below strict.start (0.25) -> PINCH_START
    expect(strict.update(makeHand(0.08), 1000).state).toBe('PINCH_START');
  });

  // --- Hold duration tracking (Plan 21-01, 21-03) ---

  it('getHoldDuration returns 0 outside PINCH_HOLD', () => {
    const d = new PinchDetector();
    expect(d.getHoldDuration(1000)).toBe(0);
    d.update(makeHand(0.1), 1000); // PINCH_START
    expect(d.getHoldDuration(1000)).toBe(0);
  });

  it('getHoldDuration accumulates while in PINCH_HOLD', () => {
    const d = new PinchDetector();
    d.update(makeHand(0.1), 1000); // PINCH_START
    d.update(makeHand(0.1), 1033); // PINCH_HOLD starts
    expect(d.getHoldDuration(1033)).toBe(0); // same frame as entering
    expect(d.getHoldDuration(1100)).toBe(67);
    expect(d.getHoldDuration(2033)).toBe(1000);
  });

  it('getHoldDuration resets when leaving PINCH_HOLD', () => {
    const d = new PinchDetector();
    d.update(makeHand(0.1), 1000);
    d.update(makeHand(0.1), 1033);
    expect(d.getHoldDuration(2000)).toBe(967);
    d.update(makeHand(0.5), 2033); // release — far apart
    expect(d.getHoldDuration(3000)).toBe(0);
  });

  it('resetHold clears the timer (used after PRESSING -> RELEASED)', () => {
    const d = new PinchDetector();
    d.update(makeHand(0.1), 1000);
    d.update(makeHand(0.1), 1033);
    expect(d.getHoldDuration(2000)).toBe(967);
    d.resetHold();
    // Even though state is still PINCH_HOLD, timer is reset.
    expect(d.getHoldDuration(2000)).toBe(0);
  });

  // --- Zoom disambiguation helpers (Plan 21-02) ---

  it('isAtMinimumDistance buffers small jitter (pinch held steady)', () => {
    const d = new PinchDetector();
    expect(d.isAtMinimumDistance(0.34)).toBe(true); // within start + 0.02 jitter
    expect(d.isAtMinimumDistance(0.4)).toBe(false);
  });

  it('isDynamic returns false in OPEN, true only in PINCH_HOLD with raw delta >= threshold', () => {
    const d = new PinchDetector();
    expect(d.isDynamic()).toBe(false); // OPEN — short circuits
    // Establish PINCH_HOLD
    d.update(makeHand(0.1), 1000);
    d.update(makeHand(0.1), 1033);
    expect(d.isDynamic(0.04)).toBe(false); // no delta on first call
    d.update(makeHand(0.05), 1066); // moving closer (raw delta ~0.125)
    expect(d.isDynamic(0.04)).toBe(true);
  });
});
