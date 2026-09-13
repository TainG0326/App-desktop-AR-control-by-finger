import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PointerController } from '@renderer/interaction/PointerController.js';
import { pointerRef, usePointerStore } from '@renderer/stores/pointerStore.js';
import type { HandFrame } from '@renderer/hand-tracking/types.js';

const fakeHand = (x: number, y: number, score = 0.9): HandFrame => ({
  hands: [
    {
      handedness: 'Right',
      score,
      landmarks: Array.from({ length: 21 }, () => ({ x, y, z: 0 })),
      worldLandmarks: []
    }
  ],
  timestampMs: performance.now(),
  inferenceMs: 10,
  fps: 30
});

describe('PointerController', () => {
  beforeEach(() => {
    Object.assign(pointerRef, { position: { x: -9999, y: -9999 }, visible: false, confidence: 0, hoverIds: [], topHoverId: null });
    usePointerStore.setState({ position: { x: -9999, y: -9999 }, visible: false, confidence: 0, hoverIds: [], topHoverId: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not throw when constructed', () => {
    const ctrl = new PointerController({
      mirror: true,
      calibration: null,
      smoothing: 0.5,
      cursorSensitivity: 1.0
    });
    expect(ctrl).toBeTruthy();
  });

  it('updates pointerRef on frame', () => {
    const ctrl = new PointerController({
      mirror: true,
      calibration: null,
      smoothing: 0.5,
      cursorSensitivity: 1.0
    });
    // @ts-expect-error private method
    ctrl.onFrame(fakeHand(0.3, 0.5));
    expect(pointerRef.visible).toBe(true);
    expect(usePointerStore.getState().visible).toBe(true);
    // Mirror=true: 0.3 → x = (1 - 0.3) * innerWidth
    expect(pointerRef.position.x).toBeCloseTo((1 - 0.3) * window.innerWidth, 0);
    expect(pointerRef.position.y).toBeCloseTo(0.5 * window.innerHeight, 0);
  });

  it('handles lost hand by hiding the pointer', () => {
    const ctrl = new PointerController({
      mirror: false,
      calibration: null,
      smoothing: 0.5,
      cursorSensitivity: 1.0
    });
    // @ts-expect-error private method
    ctrl.onFrame(fakeHand(0.4, 0.4));
    expect(pointerRef.visible).toBe(true);
    // @ts-expect-error private method
    ctrl.onFrame({ hands: [], timestampMs: performance.now(), inferenceMs: 0, fps: 0 });
    expect(pointerRef.visible).toBe(false);
  });

  it('respects calibration if provided', () => {
    const ctrl = new PointerController({
      mirror: false,
      calibration: {
        topLeft: { camX: 0, camY: 0, screenX: 0, screenY: 0 },
        topRight: { camX: 1, camY: 0, screenX: 1000, screenY: 0 },
        bottomRight: { camX: 1, camY: 1, screenX: 1000, screenY: 800 },
        bottomLeft: { camX: 0, camY: 1, screenX: 0, screenY: 800 }
      },
      smoothing: 0.5,
      cursorSensitivity: 1.0
    });
    // @ts-expect-error private method
    ctrl.onFrame(fakeHand(0.5, 0.5));
    expect(pointerRef.position.x).toBeCloseTo(500, 0);
    expect(pointerRef.position.y).toBeCloseTo(400, 0);
  });
});