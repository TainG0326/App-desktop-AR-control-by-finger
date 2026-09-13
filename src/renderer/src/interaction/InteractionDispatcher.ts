import { getGestureEngine } from '../gestures/GestureEngine.js';
import { pointerRef } from '../stores/pointerStore.js';
import { getInputRouter } from './InputRouter.js';
import type { GestureEvent } from '../gestures/stateMachine.js';

/**
 * Converts hand gesture events (CLICK, DRAG_*, HOLD_DRAG_*) into synthetic
 * DOM pointer events, enabling React onClick handlers and drag interactions
 * to work with hand gestures.
 *
 * Routing: when PINCH_START happens over NATIVE_WEB_CONTENT, this dispatcher
 * skips the gesture (WebContentInputDispatcher handles it instead). This
 * prevents duplicate events when the hand is over the browser content.
 */
class InteractionDispatcher {
  private unsubscribe: (() => void) | null = null;
  private rafHandle: number | null = null;
  private hoveredElement: Element | null = null;
  /** Cached button-press state for synthesizing drag pointer events. */
  private pressActive = false;
  /** True once a pointerdown has been synthesized for the current press. */
  private pointerDownDispatched = false;
  /**
   * The element that received the original pointerdown. We re-use this for
   * every subsequent pointermove and pointerup so the drag stays glued to
   * the draggable region (e.g. window title bar) even as the cursor moves
   * and the element's bounding rect changes under it.
   */
  private dragTarget: Element | null = null;
  /**
   * Accumulated drag position pending RAF flush. Allows coalescing multiple
   * DRAG_MOVE events between frames into a single pointermove, keeping drag
   * in sync with the visual cursor at 60 fps.
   */
  private pendingDrag: { x: number; y: number } | null = null;

  /**
   * Pointer capture lock — determined at PINCH_START.
   *  - 'web'   → WebContentInputDispatcher handles (skip DOM)
   *  - 'dom'   → InteractionDispatcher handles (skip web)
   *  - null    → no active gesture
   */
  private lockedGesture: 'web' | 'dom' | null = null;

  start(): void {
    if (this.unsubscribe) {
      console.log('[InteractionDispatcher] start() called but already running');
      return;
    }

    console.log('[InteractionDispatcher] start() - subscribing to FSM events');
    const fsm = getGestureEngine().getFsm();
    this.unsubscribe = fsm.onEvent((e) => this.handleGestureEvent(e));

    // RAF loop for hover tracking + drag event coalescing.
    const tick = (): void => {
      this.updateHover();
      // Flush any pending drag move at RAF rate (60 fps) so drag is as smooth
      // as the cursor visual.
      if (this.pendingDrag && this.pressActive && this.dragTarget) {
        const { x, y } = this.pendingDrag;
        this.pendingDrag = null;
        this.dispatchPointerMove(x, y, this.dragTarget, { buttons: 1 });
      }
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
    console.log('[InteractionDispatcher] start() - RAF loop started');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.hoveredElement = null;
    this.pressActive = false;
    this.dragTarget = null;
    this.pointerDownDispatched = false;
    this.pendingDrag = null;
    this.lockedGesture = null;
  }

  private updateHover(): void {
    if (!pointerRef.visible) {
      if (this.hoveredElement) {
        const p = pointerRef.position;
        this.dispatchPointerLeave(p.x, p.y, this.hoveredElement);
        this.hoveredElement = null;
      }
      return;
    }

    const p = pointerRef.position;
    const newHovered = document.elementFromPoint(p.x, p.y);
    if (newHovered !== this.hoveredElement) {
      if (this.hoveredElement) {
        this.dispatchPointerLeave(p.x, p.y, this.hoveredElement);
      }
      if (newHovered) {
        this.dispatchPointerEnter(p.x, p.y, newHovered);
      }
      this.hoveredElement = newHovered;
    }
  }

  private handleGestureEvent(e: GestureEvent): void {
    if (e.type !== 'ZOOM_UPDATE' && e.type !== 'DWELL_PROGRESS' && e.type !== 'HOLD_PROGRESS') {
      console.log('[InteractionDispatcher] handleGestureEvent:', e.type);
    }
    const p = pointerRef.position;

    // ── PINCH_START: decide which dispatcher owns this gesture ───────────────
    if (e.type === 'PINCH_START') {
      const router = getInputRouter();
      if (!pointerRef.visible) return;
      const owner = router.determineOwner();

      if (owner.type === 'NATIVE_WEB_CONTENT') {
        // WebContentInputDispatcher will handle this gesture.
        this.lockedGesture = 'web';
        console.log('[InteractionDispatcher] PINCH_START → web content, skipping DOM');
      } else {
        // We own this gesture — lock DOM element.
        this.lockedGesture = 'dom';
        const target = this.hoveredElement || document.elementFromPoint(p.x, p.y);
        if (target) {
          this.dragTarget = target;
          this.pressActive = true;
        }
      }
      return;
    }

    // ── Skip if another dispatcher owns this gesture ──────────────────────────
    if (this.lockedGesture === 'web') {
      // End the web capture on gesture termination.
      if (
        e.type === 'DRAG_END' ||
        e.type === 'HOLD_DRAG_END' ||
        e.type === 'ZOOM_END' ||
        e.type === 'LOST'
      ) {
        this.lockedGesture = null;
      }
      return;
    }

    // ── DOM dispatch for our own gestures ───────────────────────────────────
    switch (e.type) {
      case 'CLICK': {
        const target = this.hoveredElement || document.elementFromPoint(p.x, p.y);
        console.log('[InteractionDispatcher] CLICK at', p, 'target:', target?.tagName, target?.className);
        if (target) this.dispatchClick(p.x, p.y, target);
        this.pressActive = false;
        break;
      }
      case 'DRAG_START': {
        const target = this.dragTarget || this.hoveredElement || document.elementFromPoint(p.x, p.y);
        console.log('[InteractionDispatcher] DRAG_START at', p, 'target:', target?.tagName, target?.className);
        if (target) {
          this.dispatchPointerDown(p.x, p.y, target, { buttons: 1 });
          this.pressActive = true;
          this.dragTarget = target;
        }
        break;
      }
      case 'DRAG_MOVE': {
        if (!this.pressActive || !this.dragTarget) return;
        // Coalesce: store the latest position; RAF flush dispatches one event.
        this.pendingDrag = { x: p.x, y: p.y };
        break;
      }
      case 'DRAG_END': {
        if (!this.pressActive) {
          this.lockedGesture = null;
          return;
        }
        // Flush final drag position before releasing.
        if (this.pendingDrag && this.dragTarget) {
          const { x, y } = this.pendingDrag;
          this.pendingDrag = null;
          this.dispatchPointerMove(x, y, this.dragTarget, { buttons: 1 });
        }
        const target = this.dragTarget;
        console.log('[InteractionDispatcher] DRAG_END at', p, 'target:', target?.tagName);
        if (target && this.pointerDownDispatched) {
          this.dispatchPointerUp(p.x, p.y, target, { buttons: 0 });
        }
        this.pressActive = false;
        this.dragTarget = null;
        this.pointerDownDispatched = false;
        this.lockedGesture = null;
        break;
      }
      case 'HOLD_DRAG_MOVE': {
        if (!this.pressActive || !this.dragTarget) return;
        this.pendingDrag = { x: p.x, y: p.y };
        break;
      }
      case 'HOLD_DRAG_END': {
        // Flush final drag position.
        if (this.pendingDrag && this.dragTarget) {
          const { x, y } = this.pendingDrag;
          this.pendingDrag = null;
          this.dispatchPointerMove(x, y, this.dragTarget, { buttons: 1 });
        }
        const target = this.dragTarget;
        if (target) this.dispatchPointerUp(p.x, p.y, target, { buttons: 0 });
        this.pressActive = false;
        this.dragTarget = null;
        this.pointerDownDispatched = false;
        this.lockedGesture = null;
        break;
      }
      case 'HOVER_ENTER':
      case 'HOVER_LEAVE':
      case 'HOLD_PROGRESS':
      case 'HOLD_DRAG_READY':
        // No DOM dispatch for these.
        break;
      case 'LOST': {
        // End any in-progress DOM gesture (fire mouseUp if needed).
        if (this.pressActive && this.dragTarget && this.pointerDownDispatched) {
          const p2 = pointerRef.position;
          this.dispatchPointerUp(p2.x, p2.y, this.dragTarget, { buttons: 0 });
        }
        this.pressActive = false;
        this.dragTarget = null;
        this.pointerDownDispatched = false;
        this.pendingDrag = null;
        this.lockedGesture = null;
        break;
      }
      case 'RECOVERED':
        // No DOM dispatch for these.
        break;
    }
  }

  private dispatchClick(x: number, y: number, target: Element): void {
    // Use closest() for robust walk-up so the click always lands on the
    // interactive ancestor (button/a/[role=button]/[data-interactive]).
    const clickTarget =
      target.closest(
        'button, a, input, textarea, select, [role="button"], [data-interactive], [onclick]'
      ) ?? target;

    console.log('[InteractionDispatcher] dispatchClick: target=', target.tagName, 'clickTarget=', clickTarget.tagName, clickTarget.className);

    const opts = {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      pointerType: 'mouse' as const,
      isPrimary: true,
      pointerId: 1
    };
    clickTarget.dispatchEvent(new PointerEvent('pointerdown', opts));
    clickTarget.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    clickTarget.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0, detail: 1 }));
  }

  private dispatchPointerDown(
    x: number,
    y: number,
    target: Element,
    extra: { buttons: number }
  ): void {
    const opts = {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: extra.buttons,
      pointerType: 'mouse' as const,
      isPrimary: true,
      pointerId: 1
    };
    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    this.pointerDownDispatched = true;
  }

  private dispatchPointerMove(
    x: number,
    y: number,
    target: Element,
    extra: { buttons: number }
  ): void {
    const opts = {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: extra.buttons,
      pointerType: 'mouse' as const,
      isPrimary: true,
      pointerId: 1
    };
    target.dispatchEvent(new PointerEvent('pointermove', opts));
  }

  private dispatchPointerUp(
    x: number,
    y: number,
    target: Element,
    extra: { buttons: number }
  ): void {
    const opts = {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: extra.buttons,
      pointerType: 'mouse' as const,
      isPrimary: true,
      pointerId: 1
    };
    target.dispatchEvent(new PointerEvent('pointerup', opts));
  }

  private dispatchPointerEnter(x: number, y: number, target: Element): void {
    const opts = {
      clientX: x,
      clientY: y,
      bubbles: false,
      cancelable: false,
      pointerType: 'mouse' as const,
      isPrimary: true,
      pointerId: 1
    };
    target.dispatchEvent(new PointerEvent('pointerenter', opts));
  }

  private dispatchPointerLeave(x: number, y: number, target: Element): void {
    const opts = {
      clientX: x,
      clientY: y,
      bubbles: false,
      cancelable: false,
      pointerType: 'mouse' as const,
      isPrimary: true,
      pointerId: 1
    };
    target.dispatchEvent(new PointerEvent('pointerleave', opts));
  }
}

let instance: InteractionDispatcher | null = null;

export function getInteractionDispatcher(): InteractionDispatcher {
  if (!instance) {
    instance = new InteractionDispatcher();
  }
  return instance;
}
