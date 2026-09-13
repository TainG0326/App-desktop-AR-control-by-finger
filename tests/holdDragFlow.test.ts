import { describe, it, expect } from 'vitest';
import { GestureFSM, type PointerSnapshot } from '@renderer/gestures/stateMachine.js';

function snap(overrides: Partial<PointerSnapshot> = {}): PointerSnapshot {
  return {
    position: { x: 100, y: 100 },
    overTarget: false,
    handVisible: true,
    pinchState: 'OPEN',
    pinchHoldMs: 0,
    pinchDelta: 0,
    tMs: 1000,
    ...overrides
  };
}

describe('Hold-Drag Flow (integration)', () => {
  it('hold-drag movement sends continuous events at gesture frame rate', () => {
    const fsm = new GestureFSM({ holdDragMs: 3000, holdDragSensitivityPx: 4 });
    const events: { type: string; tMs: number }[] = [];
    fsm.onEvent((e) => {
      events.push({ type: e.type, tMs: e.tMs });
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    // Enter PRESSING
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 50, tMs: 1000 }));
    // Enter HOLD_DRAG
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 3100, tMs: 4000 }));
    expect(events.some((e) => e.type === 'HOLD_DRAG_READY')).toBe(true);

    // Move cursor through 5 frames
    for (let i = 1; i <= 5; i++) {
      fsm.update(snap({
        overTarget: true,
        pinchState: 'PINCH_HOLD',
        pinchHoldMs: 3100 + i * 50,
        position: { x: 100 + i * 5, y: 100 },
        tMs: 4000 + i * 50
      }));
    }
    const moveEvents = events.filter((e) => e.type === 'HOLD_DRAG_MOVE');
    expect(moveEvents.length).toBe(5);

    // Release
    fsm.update(snap({ overTarget: true, pinchState: 'OPEN', pinchHoldMs: 0, tMs: 5000 }));
    expect(events[events.length - 1].type).toBe('HOLD_DRAG_END');
  });

  it('smoothness: per-frame cursor delta stays bounded while hold-dragging', () => {
    const fsm = new GestureFSM({ holdDragMs: 3000, holdDragSensitivityPx: 4 });
    const positions: { x: number; y: number }[] = [];
    fsm.onEvent((e) => {
      if (e.type === 'HOLD_DRAG_MOVE') {
        positions.push({ x: e.x, y: e.y });
      }
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 50, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 3100, tMs: 4000 }));

    // Simulate 60 frames of slow continuous movement (10px/sec at 30fps ≈ 0.33px/frame).
    let cursorX = 105;
    for (let i = 0; i < 60; i++) {
      cursorX += 0.33;
      fsm.update(snap({
        overTarget: true,
        pinchState: 'PINCH_HOLD',
        pinchHoldMs: 3100 + (i + 1) * 33,
        position: { x: cursorX, y: 100 },
        tMs: 4000 + (i + 1) * 33
      }));
    }

    // Per-frame delta should be small and consistent.
    expect(positions.length).toBeGreaterThan(50);
    const deltas: number[] = [];
    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      deltas.push(Math.abs(dx));
    }
    const maxDelta = Math.max(...deltas);
    // No single frame should jump more than 4px (jitter guard).
    expect(maxDelta).toBeLessThan(4);
  });

  // NOTE: "zooming overrides hold-drag mid-gesture" test was removed in
  // the v2 zoom refactor — zoom is now driven by the 5-finger gesture
  // (FiveFingerZoomDetector) outside the FSM, so the FSM no longer
  // transitions HOLD_DRAG → ZOOMING.
});
