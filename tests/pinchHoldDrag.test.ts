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

describe('Pinch Hold-Drag', () => {
  it('enters HOLD_DRAG after holding pinch >= holdDragMs without moving', () => {
    const fsm = new GestureFSM({ holdDragMs: 3000 });
    let holdReady = false;
    fsm.onEvent((e) => {
      if (e.type === 'HOLD_DRAG_READY') holdReady = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 100, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 3100, tMs: 4000 }));
    expect(holdReady).toBe(true);
    expect(fsm.getState()).toBe('HOLD_DRAG');
  });

  it('does NOT enter HOLD_DRAG if cursor moved before threshold', () => {
    const fsm = new GestureFSM({ holdDragMs: 3000, dragPx: 6 });
    let holdReady = false;
    fsm.onEvent((e) => {
      if (e.type === 'HOLD_DRAG_READY') holdReady = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 100, tMs: 1000 }));
    fsm.update(snap({
      overTarget: true,
      pinchState: 'PINCH_HOLD',
      pinchHoldMs: 200,
      position: { x: 110, y: 100 },
      tMs: 1100
    }));
    // Cursor moved 10px > dragPx — should go to DRAGGING, not HOLD_DRAG.
    expect(holdReady).toBe(false);
    expect(fsm.getState()).toBe('DRAGGING');
  });

  it('Hold-drag fires HOLD_DRAG_MOVE events when cursor moves slightly', () => {
    const fsm = new GestureFSM({ holdDragSensitivityPx: 4 });
    const movePositions: { x: number; y: number }[] = [];
    fsm.onEvent((e) => {
      if (e.type === 'HOLD_DRAG_MOVE') {
        movePositions.push({ x: e.x, y: e.y });
      }
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 100, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 3100, tMs: 4000 }));
    fsm.update(snap({
      overTarget: true,
      pinchState: 'PINCH_HOLD',
      pinchHoldMs: 3200,
      position: { x: 105, y: 100 },
      tMs: 4200
    }));
    fsm.update(snap({
      overTarget: true,
      pinchState: 'PINCH_HOLD',
      pinchHoldMs: 3300,
      position: { x: 110, y: 100 },
      tMs: 4400
    }));
    expect(movePositions.length).toBeGreaterThanOrEqual(1);
    expect(movePositions[movePositions.length - 1]).toEqual({ x: 110, y: 100 });
  });

  it('Hold-drag fires HOLD_DRAG_END on release', () => {
    const fsm = new GestureFSM({ holdDragMs: 3000 });
    let holdEnd = false;
    let clicked = false;
    fsm.onEvent((e) => {
      if (e.type === 'HOLD_DRAG_END') holdEnd = true;
      if (e.type === 'CLICK') clicked = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 100, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 3100, tMs: 4000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'OPEN', pinchHoldMs: 0, tMs: 4100 }));
    expect(holdEnd).toBe(true);
    expect(clicked).toBe(false); // MUST NOT click after entering hold-drag
  });

  // NOTE: "zooming takes priority over hold-drag" test was removed in
  // the v2 zoom refactor — zoom is now driven by the 5-finger gesture
  // outside the FSM; 2-finger pinch never transitions to zoom.

  it('short pinch + release does NOT fire CLICK (click is dwell-only)', () => {
    const fsm = new GestureFSM({ dwellMs: 800 });
    let clicked = false;
    fsm.onEvent((e) => {
      if (e.type === 'CLICK') clicked = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 30, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'OPEN', pinchHoldMs: 0, tMs: 1030 }));
    // Pinch-only interaction does NOT click. Click only from dwell.
    expect(clicked).toBe(false);
  });
});
