import { describe, it, expect } from 'vitest';
import {
  normalizeLandmark,
  getIndexFingertip,
  palmSize,
  type NormalizeOptions
} from '@renderer/interaction/landmarkNormalizer.js';
import { LANDMARK } from '@renderer/hand-tracking/types.js';
import type { TrackedHand, NormalizedLandmark } from '@renderer/hand-tracking/types.js';

function makeHand(): TrackedHand {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 21 }, (_, i) => ({
    x: 0.1 * (i % 10),
    y: 0.1 * Math.floor(i / 10),
    z: 0
  }));
  // Place wrist at (0, 0.9) and middle MCP at (0, 0.5) so palmSize ≈ 0.4.
  landmarks[LANDMARK.WRIST] = { x: 0.5, y: 0.9, z: 0 };
  landmarks[LANDMARK.MIDDLE_MCP] = { x: 0.5, y: 0.5, z: 0 };
  return {
    handedness: 'Right',
    score: 0.9,
    landmarks,
    worldLandmarks: []
  };
}

const opts = (mirror: boolean): NormalizeOptions => ({
  viewportWidth: 1000,
  viewportHeight: 800,
  mirror
});

describe('normalizeLandmark', () => {
  it('maps camera-space to screen without calibration', () => {
    const p = normalizeLandmark({ x: 0.25, y: 0.5, z: 0 }, opts(false));
    expect(p.x).toBe(250);
    expect(p.y).toBe(400);
  });

  it('flips x when mirrored', () => {
    const p = normalizeLandmark({ x: 0.25, y: 0.5, z: 0 }, opts(true));
    expect(p.x).toBe(750);
    expect(p.y).toBe(400);
  });

  it('clamps out-of-range values', () => {
    const p = normalizeLandmark({ x: 1.5, y: -0.4, z: 0 }, opts(false));
    expect(p.x).toBe(1000);
    expect(p.y).toBe(0);
  });

  it('respects calibration (linear at extremes)', () => {
    const cal = {
      topLeft: { camX: 0, camY: 0, screenX: 0, screenY: 0 },
      topRight: { camX: 1, camY: 0, screenX: 1000, screenY: 0 },
      bottomRight: { camX: 1, camY: 1, screenX: 1000, screenY: 800 },
      bottomLeft: { camX: 0, camY: 1, screenX: 0, screenY: 800 }
    };
    const p = normalizeLandmark({ x: 0.5, y: 0.5, z: 0 }, {
      viewportWidth: 1000,
      viewportHeight: 800,
      mirror: false,
      calibration: cal
    });
    expect(p.x).toBeCloseTo(500, 0);
    expect(p.y).toBeCloseTo(400, 0);
  });
});

describe('getIndexFingertip', () => {
  it('returns the landmark at INDEX_TIP', () => {
    const hand = makeHand();
    const tip = getIndexFingertip(hand);
    expect(tip).not.toBeNull();
    expect(tip!.x).toBe(hand.landmarks[LANDMARK.INDEX_TIP].x);
  });

  it('returns null for incomplete landmark arrays', () => {
    const h: TrackedHand = {
      handedness: 'Right',
      score: 0.5,
      landmarks: Array.from({ length: 5 }, () => ({ x: 0, y: 0, z: 0 })),
      worldLandmarks: []
    };
    expect(getIndexFingertip(h)).toBeNull();
  });
});

describe('palmSize', () => {
  it('returns the wrist→middleMCP distance', () => {
    const hand = makeHand();
    const size = palmSize(hand);
    // wrist (0.5,0.9), middleMCP (0.5,0.5) -> 0.4
    expect(size).toBeCloseTo(0.4, 5);
  });

  it('returns 1 when landmarks missing', () => {
    const h: TrackedHand = {
      handedness: 'Right',
      score: 0.5,
      landmarks: [],
      worldLandmarks: []
    };
    expect(palmSize(h)).toBe(1);
  });
});