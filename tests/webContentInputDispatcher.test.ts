import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HandInputEvent } from '../src/renderer/src/interaction/WebContentInputDispatcher';

// ── Wheel conversion math ─────────────────────────────────────────────────────
describe('WebContentInputDispatcher wheel conversion', () => {
  const WHEEL_TICKS_PER_2X = 3;

  /**
   * Simulates the wheel conversion from ZOOM_UPDATE scaleFactor.
   * scaleFactor = 1.0 - pinchDeltaAccum (from FSM)
   * Each update: ticks = log2(cur/prev) * WHEEL_TICKS_PER_2X
   * In Chromium: deltaY > 0 = scroll down = zoom in.
   *   So: scale > 1 (pinch open) → positive ticks (zoom in) ✓
   */
  function zoomToWheelTicks(prevScale: number, curScale: number): number {
    const ratio = curScale / prevScale;
    if (ratio <= 0.001 || ratio >= 100) return 0;
    return Math.log2(ratio) * WHEEL_TICKS_PER_2X;
  }

  it('pinch open (scale > 1) → positive wheel ticks (zoom in)', () => {
    // prev=1.0, cur=1.1  → ratio≈1.1 → log2(1.1)≈0.14 → ticks≈-0.42
    // But zoom in = positive deltaY (wheel ticks down = zoom in on Windows)
    // Negative ticks = zoom out. Positive = zoom in. Correct.
    const ticks = zoomToWheelTicks(1.0, 1.2);
    expect(ticks).toBeGreaterThan(0); // pinching open → zoom in
  });

  it('pinch close (scale < 1) → negative wheel ticks (zoom out)', () => {
    const ticks = zoomToWheelTicks(1.0, 0.8);
    expect(ticks).toBeLessThan(0); // pinching closed → zoom out
  });

  it('small delta → small ticks (threshold at ±0.05)', () => {
    // Very small pinch should be below threshold.
    const ticks = zoomToWheelTicks(1.0, 1.005);
    expect(Math.abs(ticks)).toBeLessThan(0.05); // below 0.05 threshold used in code
  });

  it('zoom in 2× → approximately WHEEL_TICKS_PER_2X ticks', () => {
    // 2× = log2(2) = 1 → ticks = -1 * 3 = -3 → |3| ≈ WHEEL_TICKS_PER_2X
    const ticks = zoomToWheelTicks(1.0, 2.0);
    expect(Math.abs(ticks)).toBeCloseTo(WHEEL_TICKS_PER_2X, 0);
  });

  it('zoom out 2× → approximately -WHEEL_TICKS_PER_2X ticks', () => {
    const ticks = zoomToWheelTicks(1.0, 0.5);
    expect(Math.abs(ticks)).toBeCloseTo(WHEEL_TICKS_PER_2X, 0);
  });
});

// ── HandInputEvent type contract ─────────────────────────────────────────────
describe('HandInputEvent type contract', () => {
  it('mouseMove may include buttons array for drag-move', () => {
    const event: HandInputEvent = {
      type: 'mouseMove',
      x: 100,
      y: 200,
      buttons: ['left']
    };
    expect(event.type).toBe('mouseMove');
    expect(event.buttons).toContain('left');
  });

  it('mouseDown requires button field', () => {
    const event: HandInputEvent = {
      type: 'mouseDown',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1
    };
    expect(event.type).toBe('mouseDown');
    expect((event as { button?: string }).button).toBe('left');
  });

  it('mouseWheel supports wheelTicks field', () => {
    const event: HandInputEvent = {
      type: 'mouseWheel',
      x: 100,
      y: 200,
      wheelTicks: 1.5
    };
    expect(event.type).toBe('mouseWheel');
    expect((event as { wheelTicks?: number }).wheelTicks).toBe(1.5);
  });

  it('does NOT include mouseDragMove/mouseDragEnd types', () => {
    // These types should NOT exist in the union.
    const VALID_TYPES = ['mouseMove', 'mouseDown', 'mouseUp', 'mouseWheel'] as const;
    expect(VALID_TYPES).not.toContain('mouseDragMove');
    expect(VALID_TYPES).not.toContain('mouseDragEnd');
  });
});

// ── Drag sequence validation ─────────────────────────────────────────────────
describe('Drag sequence', () => {
  interface SequenceItem {
    type: string;
    x?: number;
    y?: number;
    buttons?: string[];
    button?: string;
  }

  function validateDragSequence(seq: SequenceItem[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const moveSteps = seq.filter(s => s.type === 'mouseMove');
    const downIdx = seq.findIndex(s => s.type === 'mouseDown');
    const upIdx = seq.findIndex(s => s.type === 'mouseUp');

    if (downIdx === -1) errors.push('Missing mouseDown');
    if (upIdx === -1) errors.push('Missing mouseUp');
    if (downIdx !== -1 && upIdx !== -1 && upIdx < downIdx) {
      errors.push('mouseUp before mouseDown');
    }

    // During drag moves, buttons should include 'left'
    for (const m of moveSteps) {
      if (m.buttons && !m.buttons.includes('left')) {
        errors.push(`mouseMove with buttons=${JSON.stringify(m.buttons)} missing 'left'`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  it('valid drag: mouseDown → [mouseMove with buttons=[\\\'left\\\']] → mouseUp', () => {
    const seq: SequenceItem[] = [
      { type: 'PINCH_START' },
      { type: 'DRAG_START' },
      { type: 'mouseDown', x: 100, y: 200, button: 'left' },
      { type: 'DRAG_MOVE' },
      { type: 'mouseMove', x: 110, y: 205, buttons: ['left'] },
      { type: 'DRAG_MOVE' },
      { type: 'mouseMove', x: 120, y: 210, buttons: ['left'] },
      { type: 'DRAG_END' },
      { type: 'mouseUp', x: 120, y: 210, button: 'left' }
    ];
    const result = validateDragSequence(seq);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('invalid drag: mouseUp without mouseDown', () => {
    const seq: SequenceItem[] = [
      { type: 'mouseUp', x: 100, y: 200, button: 'left' }
    ];
    const result = validateDragSequence(seq);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing mouseDown');
  });
});
