/**
 * Drag-and-drop wiring for science objects.
 *
 * Wires a single draggable element to the gesture FSM. We do NOT route
 * through InteractionDispatcher (which only does pointer-event synth and
 * is hostile to 2D drag in canvas-style layouts). Instead we listen to
 * the FSM directly and translate cursor movement into element transforms.
 *
 * Why direct: science objects aren't styled as buttons or interactive
 * lists — they're positioned absolutely inside a world container, and
 * their drag delta is computed in world-container coordinates, not via
 * synthetic PointerEvents.
 */

import { useEffect, useRef } from 'react';
import { getGestureEngine } from '@renderer/gestures/GestureEngine.js';
import type { GestureEvent } from '@renderer/gestures/stateMachine.js';
import { pointerRef } from '@renderer/stores/pointerStore.js';

export interface UseDraggableOptions {
  /** Element ref. */
  ref: React.RefObject<HTMLElement | null>;
  /**
   * Convert viewport (clientX/Y) → container-relative coords.
   * Defaults to a function that returns client coords as-is — caller's
   * transform pipeline is expected to handle offset/scale.
   */
  viewportToLocal?: (x: number, y: number) => { x: number; y: number };
  /** Called on PINCH_START when cursor is over the drag target. */
  onDragStart?: () => void;
  /** Called on every DRAG_MOVE with the latest local position. */
  onDragMove?: (local: { x: number; y: number }) => void;
  /** Called on DRAG_END with final position and whether the gesture was a drag. */
  onDragEnd?: (local: { x: number; y: number; dragged: boolean }) => void;
}

/**
 * Hook that wires an element to drag via the gesture FSM.
 *
 * Implementation note: PINCH_START carries the cursor position. We use
 * that position to decide whether the drag target is under the cursor.
 * If yes, we own this gesture and lock it (this prevents InteractionDispatcher
 * from also firing clicks).
 */
export function useDraggable(opts: UseDraggableOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const fsm = getGestureEngine().getFsm();
    let dragged = false;
    const off = fsm.onEvent((e: GestureEvent) => {
      const el = optsRef.current.ref.current;
      if (!el) return;
      if (e.type === 'PINCH_START') {
        const rect = el.getBoundingClientRect();
        const inside =
          e.x >= rect.left &&
          e.x <= rect.right &&
          e.y >= rect.top &&
          e.y <= rect.bottom;
        if (inside) {
          dragged = false;
          optsRef.current.onDragStart?.();
        } else {
          dragged = false;
        }
      } else if (e.type === 'DRAG_MOVE') {
        const local = optsRef.current.viewportToLocal
          ? optsRef.current.viewportToLocal(e.x, e.y)
          : { x: e.x, y: e.y };
        dragged = true;
        optsRef.current.onDragMove?.(local);
      } else if (e.type === 'DRAG_END') {
        if (dragged) {
          const p = pointerRef.position;
          const local = optsRef.current.viewportToLocal
            ? optsRef.current.viewportToLocal(p.x, p.y)
            : { x: p.x, y: p.y };
          optsRef.current.onDragEnd?.({ ...local, dragged: true });
        }
      }
    });
    return off;
  }, []);
}
