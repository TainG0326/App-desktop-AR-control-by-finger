import { describe, it, expect } from 'vitest';
import { FiveFingerZoomDetector } from '@renderer/gestures/FiveFingerZoomDetector.js';
import { LANDMARK } from '@renderer/hand-tracking/types.js';
import type { TrackedHand } from '@renderer/hand-tracking/types.js';

function makeHand(opts: {
  spread?: number; // 0..1 scale: tips distance from palm center (multiplied by 0.2 internally)
  score?: number;
  visible?: boolean;
} = {}): TrackedHand {
  const spread = opts.spread ?? 0.5;
  const score = opts.score ?? 0.9;
  // Build a 21-landmark array. All fingertips placed at radius `spread` from
  // the palm center. Other joints are placeholders.
  const landmarks = new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));
  const cx = 0.5;
  const cy = 0.6;
  const cz = 0;
  // WRIST below palm center, MCPs at palm center — gives a non-zero palmSize
  landmarks[LANDMARK.WRIST] = { x: cx, y: cy + 0.08, z: cz };
  landmarks[LANDMARK.INDEX_MCP] = { x: cx, y: cy, z: cz };
  landmarks[LANDMARK.MIDDLE_MCP] = { x: cx, y: cy, z: cz };
  landmarks[LANDMARK.RING_MCP] = { x: cx, y: cy, z: cz };
  landmarks[LANDMARK.PINKY_MCP] = { x: cx, y: cy, z: cz };
  // Tips around palm center at radius spread
  const r = spread * 0.2; // ~0.05..0.20 normalized radius
  landmarks[LANDMARK.THUMB_TIP] = { x: cx - r, y: cy - r, z: cz };
  landmarks[LANDMARK.INDEX_TIP] = { x: cx + r, y: cy - r, z: cz };
  landmarks[LANDMARK.MIDDLE_TIP] = { x: cx + r * 0.5, y: cy - r, z: cz };
  landmarks[LANDMARK.RING_TIP] = { x: cx - r * 0.3, y: cy - r, z: cz };
  landmarks[LANDMARK.PINKY_TIP] = { x: cx - r, y: cy - r * 0.5, z: cz };

  if (opts.visible === false) {
    // Remove some tips to make the hand pose invalid
    landmarks[LANDMARK.MIDDLE_TIP] = undefined as unknown as { x: number; y: number; z: number };
  }

  return {
    handedness: 'Right',
    score,
    landmarks,
    worldLandmarks: []
  };
}

describe('FiveFingerZoomDetector', () => {
  it('emits nothing for a closed fist / no 5-finger pose', () => {
    const d = new FiveFingerZoomDetector();
    const hand = makeHand({ visible: false });
    const ev = d.update(hand, 1000);
    expect(ev).toBeNull();
  });

  it('emits ZOOM_IN when 5 fingers spread significantly above baseline', () => {
    const d = new FiveFingerZoomDetector();
    // Baseline pose
    d.update(makeHand({ spread: 0.3 }), 1000);
    // Spread opens up
    const ev = d.update(makeHand({ spread: 0.9 }), 1100);
    expect(ev?.type).toBe('ZOOM_IN');
  });

  it('emits ZOOM_OUT when 5 fingers close significantly below baseline', () => {
    const d = new FiveFingerZoomDetector();
    // Baseline pose with fingers spread
    d.update(makeHand({ spread: 0.9 }), 1000);
    // Close fingers
    const ev = d.update(makeHand({ spread: 0.2 }), 1100);
    expect(ev?.type).toBe('ZOOM_OUT');
  });

  it('does NOT emit when motion is below threshold', () => {
    const d = new FiveFingerZoomDetector();
    d.update(makeHand({ spread: 0.5 }), 1000);
    const ev = d.update(makeHand({ spread: 0.55 }), 1100);
    expect(ev).toBeNull();
  });

  it('does NOT spam — second motion during cooldown is ignored', () => {
    const d = new FiveFingerZoomDetector();
    d.update(makeHand({ spread: 0.3 }), 1000);
    expect(d.update(makeHand({ spread: 0.9 }), 1100)?.type).toBe('ZOOM_IN');
    // Immediately try to close fingers — should be ignored (in cooldown).
    const ev = d.update(makeHand({ spread: 0.1 }), 1200);
    expect(ev).toBeNull();
  });

  it('allows a new gesture after cooldown AND spread returns near baseline', () => {
    const d = new FiveFingerZoomDetector();
    // First gesture: spread out
    d.update(makeHand({ spread: 0.3 }), 1000);
    expect(d.update(makeHand({ spread: 0.9 }), 1100)?.type).toBe('ZOOM_IN');
    // Wait for cooldown to expire AND return to baseline
    d.update(makeHand({ spread: 0.35 }), 2000); // still in cooldown
    // After cooldown + return to baseline → fresh IDLE on next frame
    d.update(makeHand({ spread: 0.35 }), 2100);
    // Now perform close gesture
    const ev = d.update(makeHand({ spread: 0.1 }), 2200);
    expect(ev?.type).toBe('ZOOM_OUT');
  });

  it('emits only ONE step per gesture session even with continued extreme motion', () => {
    const d = new FiveFingerZoomDetector();
    d.update(makeHand({ spread: 0.2 }), 1000);
    // Extreme spread → first step
    expect(d.update(makeHand({ spread: 1.0 }), 1050)?.type).toBe('ZOOM_IN');
    // Continued extreme → ignored
    expect(d.update(makeHand({ spread: 1.0 }), 1100)).toBeNull();
    expect(d.update(makeHand({ spread: 1.0 }), 1150)).toBeNull();
  });

  it('hand-lost during cooldown resets the detector cleanly', () => {
    const d = new FiveFingerZoomDetector();
    d.update(makeHand({ spread: 0.3 }), 1000);
    expect(d.update(makeHand({ spread: 0.9 }), 1100)?.type).toBe('ZOOM_IN');
    // Hand lost (null)
    d.update(null, 1200);
    // Hand returns → fresh IDLE on next valid frame
    expect(d.update(makeHand({ spread: 0.3 }), 2000)).toBeNull();
    // Should be able to commit again
    expect(d.update(makeHand({ spread: 0.9 }), 2100)?.type).toBe('ZOOM_IN');
  });
});