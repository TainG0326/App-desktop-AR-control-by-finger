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

describe('GestureFSM (dwell click + pinch drag/zoom)', () => {
  it('starts IDLE', () => {
    const fsm = new GestureFSM();
    expect(fsm.getState()).toBe('IDLE');
  });

  it('IDLE -> TRACKING when hand visible', () => {
    const fsm = new GestureFSM();
    const next = fsm.update(snap());
    expect(next).toBe('TRACKING');
  });

  it('TRACKING -> HOVERING on overTarget', () => {
    const fsm = new GestureFSM();
    fsm.update(snap());
    const next = fsm.update(snap({ overTarget: true }));
    expect(next).toBe('HOVERING');
  });

  it('HOVERING -> TRACKING when cursor leaves target (no pinch)', () => {
    const fsm = new GestureFSM();
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    const next = fsm.update(snap({ overTarget: false }));
    expect(next).toBe('TRACKING');
  });

  // --- DWELL click (original behavior) ---

  it('HOVERING -> DWELLING when cursor rests over target (no pinch)', () => {
    const fsm = new GestureFSM();
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    const next = fsm.update(snap({ overTarget: true, pinchState: 'OPEN' }));
    expect(next).toBe('DWELLING');
  });

  it('DWELLING emits DWELL_PROGRESS while timer counts up', () => {
    const fsm = new GestureFSM({ dwellMs: 800 });
    let lastProgress = 0;
    fsm.onEvent((e) => {
      if (e.type === 'DWELL_PROGRESS') lastProgress = e.progress;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, tMs: 1000 })); // enter DWELLING
    fsm.update(snap({ overTarget: true, tMs: 1200 })); // 200ms in
    expect(lastProgress).toBeGreaterThan(0);
    expect(lastProgress).toBeLessThan(1);
  });

  it('DWELLING fires CLICK when dwellMs elapsed', () => {
    const fsm = new GestureFSM({ dwellMs: 800 });
    let clicked = false;
    fsm.onEvent((e) => {
      if (e.type === 'CLICK') clicked = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, tMs: 1000 })); // enter DWELLING
    fsm.update(snap({ overTarget: true, tMs: 1800 })); // 800ms elapsed → CLICK
    expect(clicked).toBe(true);
  });

  it('DWELLING cancels when cursor drifts beyond dwellJitterPx', () => {
    const fsm = new GestureFSM({ dwellMs: 800, dwellJitterPx: 4 });
    let canceled = false;
    fsm.onEvent((e) => {
      if (e.type === 'DWELL_CANCEL') canceled = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, tMs: 1000 })); // DWELLING
    fsm.update(snap({ overTarget: true, tMs: 1200, position: { x: 120, y: 100 } }));
    expect(canceled).toBe(true);
  });

  it('DWELLING cancels when cursor leaves target', () => {
    const fsm = new GestureFSM({ dwellMs: 800 });
    let clicked = false;
    fsm.onEvent((e) => {
      if (e.type === 'CLICK') clicked = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, tMs: 1000 })); // DWELLING
    fsm.update(snap({ overTarget: false, tMs: 1400 })); // leaves target
    fsm.update(snap({ overTarget: false, tMs: 2000 }));
    expect(clicked).toBe(false);
    expect(fsm.getState()).toBe('TRACKING');
  });

  it('DWELLING cancels when pinch starts (transitions to PRESSING)', () => {
    const fsm = new GestureFSM({ dwellMs: 800 });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, tMs: 1000 })); // DWELLING
    const next = fsm.update(snap({
      overTarget: true,
      pinchState: 'PINCH_HOLD',
      pinchHoldMs: 30,
      tMs: 1100
    }));
    expect(next).toBe('PRESSING');
  });

  // --- PINCH + release = NO CLICK (pinch is for drag/zoom) ---

  it('PRESSING -> release does NOT fire CLICK (pinch is for drag/zoom only)', () => {
    const fsm = new GestureFSM();
    let clicked = false;
    fsm.onEvent((e) => {
      if (e.type === 'CLICK') clicked = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 50, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'OPEN', tMs: 1100 }));
    expect(clicked).toBe(false);
  });

  // --- DRAG (pinch + move) ---

  it('PRESSING -> DRAGGING when cursor moves beyond dragPx', () => {
    const fsm = new GestureFSM({ dragPx: 6 });
    let dragStarted = false;
    fsm.onEvent((e) => {
      if (e.type === 'DRAG_START') dragStarted = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 50, tMs: 1000 }));
    fsm.update(snap({
      overTarget: true,
      pinchState: 'PINCH_HOLD',
      pinchHoldMs: 60,
      position: { x: 110, y: 100 },
      tMs: 1030
    }));
    expect(dragStarted).toBe(true);
    expect(fsm.getState()).toBe('DRAGGING');
  });

  it('DRAGGING -> DRAG_END on release', () => {
    const fsm = new GestureFSM({ dragPx: 6 });
    let dragEnded = false;
    fsm.onEvent((e) => {
      if (e.type === 'DRAG_END') dragEnded = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 50, tMs: 1000 }));
    fsm.update(snap({
      overTarget: true,
      pinchState: 'PINCH_HOLD',
      pinchHoldMs: 60,
      position: { x: 110, y: 100 },
      tMs: 1030
    }));
    fsm.update(snap({
      overTarget: true,
      pinchState: 'OPEN',
      tMs: 1100
    }));
    expect(dragEnded).toBe(true);
  });

  // --- HOLD_DRAG (pinch held still for 3s) ---

  it('PRESSING -> HOLD_DRAG after holdDragMs without moving', () => {
    const fsm = new GestureFSM({ holdDragMs: 3000 });
    let holdArmed = false;
    fsm.onEvent((e) => {
      if (e.type === 'HOLD_DRAG_READY') holdArmed = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 100, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 3100, tMs: 4000 }));
    expect(holdArmed).toBe(true);
    expect(fsm.getState()).toBe('HOLD_DRAG');
  });

  it('HOLD_DRAG -> HOLD_DRAGGING when cursor moves >= holdDragSensitivityPx', () => {
    const fsm = new GestureFSM({ holdDragSensitivityPx: 4 });
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
    expect(fsm.getState()).toBe('HOLD_DRAGGING');
  });

  it('HOLD_DRAG -> release does NOT fire CLICK', () => {
    const fsm = new GestureFSM({ holdDragMs: 3000 });
    let clicked = false;
    fsm.onEvent((e) => {
      if (e.type === 'CLICK') clicked = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 100, tMs: 1000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'PINCH_HOLD', pinchHoldMs: 3100, tMs: 4000 }));
    fsm.update(snap({ overTarget: true, pinchState: 'OPEN', tMs: 4100 }));
    expect(clicked).toBe(false);
  });

  // --- Hand lost / recovery ---

  it('hand lost -> LOST_TRACKING (aborts dwell and press)', () => {
    const fsm = new GestureFSM();
    let lost = false;
    fsm.onEvent((e) => {
      if (e.type === 'LOST') lost = true;
    });
    fsm.update(snap());
    fsm.update(snap({ overTarget: true }));
    fsm.update(snap({ overTarget: true, tMs: 1000 })); // DWELLING
    const next = fsm.update(snap({ handVisible: false, tMs: 1100 }));
    expect(lost).toBe(true);
    expect(next).toBe('LOST_TRACKING');
  });

  it('LOST_TRACKING -> IDLE after lostGraceMs', () => {
    const fsm = new GestureFSM({ lostGraceMs: 500 });
    fsm.update(snap());
    fsm.update(snap({ handVisible: false, tMs: 2000 }));
    const next = fsm.update(snap({ handVisible: false, tMs: 3000 }));
    expect(next).toBe('IDLE');
  });

  it('LOST_TRACKING -> TRACKING on recovery', () => {
    const fsm = new GestureFSM();
    fsm.update(snap());
    fsm.update(snap({ handVisible: false, tMs: 2000 }));
    const next = fsm.update(snap({ handVisible: true, tMs: 2050 }));
    expect(next).toBe('TRACKING');
  });
});
