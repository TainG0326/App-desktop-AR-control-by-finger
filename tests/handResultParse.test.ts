import { describe, it, expect } from 'vitest';
import { parseResult, pickPrimaryHand } from '@renderer/hand-tracking/parseResult.js';

describe('parseResult', () => {
  it('returns empty array when result is null', () => {
    expect(parseResult(null)).toEqual([]);
  });

  it('returns empty array when no landmarks', () => {
    expect(parseResult({ landmarks: [], handednesses: [] })).toEqual([]);
  });

  it('parses a single Right hand', () => {
    const r = parseResult({
      landmarks: [Array(21).fill({ x: 0.5, y: 0.5, z: 0 })],
      handednesses: [[{ categoryName: 'Right', score: 0.92 }]]
    });
    expect(r.length).toBe(1);
    expect(r[0].handedness).toBe('Right');
    expect(r[0].score).toBe(0.92);
    expect(r[0].landmarks.length).toBe(21);
  });

  it('parses a single Left hand', () => {
    const r = parseResult({
      landmarks: [Array(21).fill({ x: 0.5, y: 0.5, z: 0 })],
      handednesses: [[{ categoryName: 'Left', score: 0.88 }]]
    });
    expect(r[0].handedness).toBe('Left');
  });

  it('parses multiple hands', () => {
    const r = parseResult({
      landmarks: [
        Array(21).fill({ x: 0.3, y: 0.5, z: 0 }),
        Array(21).fill({ x: 0.7, y: 0.5, z: 0 })
      ],
      handednesses: [
        [{ categoryName: 'Left', score: 0.8 }],
        [{ categoryName: 'Right', score: 0.7 }]
      ]
    });
    expect(r.length).toBe(2);
    expect(r[0].handedness).toBe('Left');
    expect(r[1].handedness).toBe('Right');
  });

  it('falls back to Right when handedness missing', () => {
    const r = parseResult({
      landmarks: [Array(21).fill({ x: 0.5, y: 0.5, z: 0 })]
    });
    expect(r[0].handedness).toBe('Right');
  });
});

describe('pickPrimaryHand', () => {
  it('returns null for empty', () => {
    expect(pickPrimaryHand([])).toBeNull();
  });

  it('returns the highest-scoring hand', () => {
    const a = { handedness: 'Right' as const, score: 0.5, landmarks: [], worldLandmarks: [] };
    const b = { handedness: 'Left' as const, score: 0.9, landmarks: [], worldLandmarks: [] };
    expect(pickPrimaryHand([a, b])).toBe(b);
  });
});