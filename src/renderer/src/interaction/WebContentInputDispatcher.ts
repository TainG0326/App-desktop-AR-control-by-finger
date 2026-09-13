import { getGestureEngine } from '../gestures/GestureEngine.js';
import { pointerRef } from '../stores/pointerStore.js';
import { getCoordinateMapper } from '../utils/coordinateMapper.js';
import { getInputRouter } from './InputRouter.js';
import type { GestureEvent } from '../gestures/stateMachine.js';
import type { Point } from '../utils/coordinateMapper.js';

/**
 * Unified hand input event for IPC.
 * Uses standard Electron MouseInputEvent-compatible types only.
 */
export type HandInputEvent =
  | { type: 'mouseMove'; x: number; y: number; buttons?: ('left' | 'right' | 'middle')[] }
  | { type: 'mouseDown'; x: number; y: number; button: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'mouseUp'; x: number; y: number; button: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'mouseWheel'; x: number; y: number; deltaX?: number; deltaY?: number; wheelTicks?: number };

interface ContentAreaCache {
  windowId: string;
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * Wheel sensitivity: how many wheel ticks per 2× pinch scale.
 * 3 ticks ≈ 1 CSS "notch" on most trackpads. Sensible default.
 */
const WHEEL_TICKS_PER_2X = 3;

const THROTTLE_MS = 1000 / 60; // 60 Hz

/**
 * Bridges hand gestures + spatial pointer → real input events on a
 * WebContentsView (Chromium). Solves the problem that
 * document.elementFromPoint() can never hit a WebContentsView because
 * WebContentsView is a native child of BrowserWindow.contentView, not a
 * DOM node.
 *
 * Routing rules:
 *   - Pointer capture lock: once a gesture (CLICK/DRAG/ZOOM) starts over
 *     NATIVE_WEB_CONTENT, all subsequent events for that gesture go to that
 *     windowId even if the finger temporarily leaves the content rect.
 *     This prevents jittery fingers from losing the drag/mouse-down state.
 *   - Hover move: 60 Hz stream via sendInputEvent('mouseMove').
 *   - Dwell click: mouseDown + mouseUp.
 *   - Pinch drag: mouseDown → mouseMove(buttons=['left']) @60Hz → mouseUp.
 *   - Pinch zoom: mouseWheel proportional to pinch scale delta.
 *
 * Coordinate system: all x/y sent to injectInput are in WebContentsView
 * local pixels (the view's own coordinate space).
 */
class WebContentInputDispatcher {
  private mapper = getCoordinateMapper();
  private unsubscribe: (() => void) | null = null;
  private rafHandle: number | null = null;
  private lastMoveSentAt = 0;
  private lastMoveX = -1;
  private lastMoveY = -1;
  private lastClickWindowId: string | null = null;
  private lastClickAt = 0;

  /** Content bounds registered by BrowserAppNative / YouTubeAppNative. */
  private contentBounds = new Map<string, ContentAreaCache>();

  // --- Pointer capture lock ---
  /** The windowId locked for the current gesture. Cleared on DRAG_END / HOLD_DRAG_END / ZOOM_END / LOST. */
  private lockedWindowId: string | null = null;
  /** The last-known local coords for the locked window. */
  private lockedLocal: Point | null = null;
  /** Was the pointer captured on this gesture? (Used to know if we own the gesture.) */
  private isCaptured = false;
  /** Set while a drag mouseDown is outstanding (between DRAG_START and DRAG_END). */
  private dragButtonDown = false;
  /** Previous scale factor for ZOOM_UPDATE → wheel conversion. */
  private prevZoomScale = 1.0;

  start(): void {
    if (this.unsubscribe) return;
    const fsm = getGestureEngine().getFsm();
    this.unsubscribe = fsm.onEvent((e) => this.handleGestureEvent(e));

    const tick = (): void => {
      this.streamHover();
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.contentBounds.clear();
    this.clearCapture();
  }

  updateContentBounds(windowId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    this.contentBounds.set(windowId, { windowId, bounds });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get the active target — either the locked capture (if captured) or the
   * current router result.
   */
  private getActiveTarget(): { windowId: string; local: Point } | null {
    if (this.lockedWindowId !== null && this.isCaptured) {
      const bounds = this.contentBounds.get(this.lockedWindowId);
      // While dragging, ALWAYS use the live cursor position mapped into the
      // captured window. Otherwise the captured lockedLocal stays at the
      // start position and the WebContentsView never receives any mouseMove
      // events for the drag — so the press-drag-release effectively collapses
      // to a single click at the start point.
      if (bounds && this.dragButtonDown) {
        const live = this.mapper.toLocal(pointerRef.position, bounds.bounds);
        if (live) return { windowId: this.lockedWindowId, local: live };
      }
      if (bounds && this.lockedLocal) {
        return { windowId: this.lockedWindowId, local: this.lockedLocal };
      }
      if (this.lockedLocal) return { windowId: this.lockedWindowId, local: this.lockedLocal };
      return null;
    }

    const router = getInputRouter();
    if (!pointerRef.visible) return null;
    const owner = router.determineOwner();
    if (owner.type !== 'NATIVE_WEB_CONTENT' || !owner.windowId || !owner.localCoords) {
      return null;
    }
    return { windowId: owner.windowId, local: owner.localCoords };
  }

  /**
   * Compute live local coords for the captured window using the current
   * spatial cursor position. Returns null if the cursor is outside the
   * captured content area (e.g. user dragged off the side).
   */
  private getLiveLocal(): { windowId: string; local: Point } | null {
    if (this.lockedWindowId === null) return null;
    const bounds = this.contentBounds.get(this.lockedWindowId);
    if (!bounds) return null;
    const live = this.mapper.toLocal(pointerRef.position, bounds.bounds);
    if (!live) return null;
    return { windowId: this.lockedWindowId, local: live };
  }

  private clearCapture(): void {
    this.lockedWindowId = null;
    this.lockedLocal = null;
    this.isCaptured = false;
    this.dragButtonDown = false;
    this.prevZoomScale = 1.0;
  }

  /** Acquire capture for a gesture targeting NATIVE_WEB_CONTENT. */
  private acquireCapture(windowId: string, local: Point): void {
    this.lockedWindowId = windowId;
    this.lockedLocal = { ...local };
    this.isCaptured = true;
    this.prevZoomScale = 1.0;
    console.log(`[WebContentInputDispatcher] CAPTURE → windowId=${windowId}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Hover stream (60 Hz)
  // ───────────────────────────────────────────────────────────────────────────

  private streamHover(): void {
    // During drag we MUST send every RAF tick so the WebContentsView keeps
    // receiving mouseMove events while the button is held. Otherwise the
    // press is registered but no follow-up movement ever arrives, so the
    // browser sees an instant down+up at the same coordinates and the page
    // only registers a click (no drag, no selection, no scroll-drag).
    if (this.dragButtonDown) {
      const live = this.getLiveLocal();
      if (!live) return;
      this.lastMoveSentAt = performance.now();
      this.lastMoveX = live.local.x;
      this.lastMoveY = live.local.y;
      this.send(live.windowId, {
        type: 'mouseMove',
        x: live.local.x,
        y: live.local.y,
        buttons: ['left']
      });
      return;
    }

    const target = this.getActiveTarget();
    if (!target) return;

    const now = performance.now();
    if (now - this.lastMoveSentAt < THROTTLE_MS) return;
    if (target.local.x === this.lastMoveX && target.local.y === this.lastMoveY) return;

    this.lastMoveSentAt = now;
    this.lastMoveX = target.local.x;
    this.lastMoveY = target.local.y;

    this.send(target.windowId, {
      type: 'mouseMove',
      x: target.local.x,
      y: target.local.y
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Gesture event handler
  // ───────────────────────────────────────────────────────────────────────────

  private handleGestureEvent(e: GestureEvent): void {
    // Only log non-high-frequency events.
    const LOUD = !['ZOOM_UPDATE', 'DWELL_PROGRESS', 'HOLD_PROGRESS', 'DRAG_MOVE', 'HOLD_DRAG_MOVE'].includes(e.type);
    if (LOUD) console.log(`[WebContentInputDispatcher] event: ${e.type}`);

    switch (e.type) {
      // ── PINCH_START: lock capture if over web content ──────────────────────
      case 'PINCH_START': {
        const router = getInputRouter();
        if (!pointerRef.visible) break;
        const owner = router.determineOwner();
        if (owner.type === 'NATIVE_WEB_CONTENT' && owner.windowId && owner.localCoords) {
          this.acquireCapture(owner.windowId, owner.localCoords);
        }
        break;
      }

      // ── CLICK: dwell click (mouseDown + mouseUp) ───────────────────────────
      case 'CLICK': {
        const target = this.getActiveTarget();
        if (!target) break;

        // Debounce: ignore duplicate CLICK within 250 ms for the same window.
        const now = performance.now();
        if (this.lastClickWindowId === target.windowId && now - this.lastClickAt < 250) {
          break;
        }
        this.lastClickWindowId = target.windowId;
        this.lastClickAt = now;

        this.send(target.windowId, {
          type: 'mouseDown',
          x: target.local.x,
          y: target.local.y,
          button: 'left',
          clickCount: 1
        });
        setTimeout(() => {
          this.send(target.windowId, {
            type: 'mouseUp',
            x: target.local.x,
            y: target.local.y,
            button: 'left',
            clickCount: 1
          });
        }, 16);
        break;
      }

      // ── DRAG: pinch + move cursor → press-drag-release ─────────────────────
      case 'DRAG_START': {
        const target = this.getActiveTarget();
        if (!target) break;
        if (!this.isCaptured) {
          // Pinch started outside web content — let InteractionDispatcher handle it.
          break;
        }
        // Update locked coords.
        this.lockedLocal = { ...target.local };
        this.dragButtonDown = true;
        this.send(target.windowId, {
          type: 'mouseDown',
          x: target.local.x,
          y: target.local.y,
          button: 'left',
          clickCount: 1
        });
        console.log(`[WebContentInputDispatcher] DRAG_START → mouseDown at (${target.local.x.toFixed(1)}, ${target.local.y.toFixed(1)})`);
        break;
      }

      case 'DRAG_MOVE': {
        const target = this.getActiveTarget();
        if (!target || !this.dragButtonDown) break;
        this.lockedLocal = { ...target.local };
        // RAF loop handles the actual send at 60 Hz — just update the coords.
        break;
      }

      case 'DRAG_END': {
        // Use the live cursor position for mouseUp so the release happens at
        // the position where the user actually stopped, not where they
        // started dragging.
        const live = this.getLiveLocal();
        const releaseWindowId = live?.windowId ?? this.lockedWindowId;
        if (releaseWindowId !== null) {
          const finalPos = live?.local ?? this.lockedLocal ?? { x: 0, y: 0 };
          this.send(releaseWindowId, {
            type: 'mouseUp',
            x: finalPos.x,
            y: finalPos.y,
            button: 'left',
            clickCount: 1
          });
          console.log(`[WebContentInputDispatcher] DRAG_END → mouseUp at (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)})`);
        }
        this.dragButtonDown = false;
        this.clearCapture();
        break;
      }

      // ── HOLD_DRAG: pinch held 3s then move → press-drag-release ────────────
      case 'HOLD_DRAG_MOVE': {
        const target = this.getActiveTarget();
        if (!target || !this.dragButtonDown) break;
        this.lockedLocal = { ...target.local };
        break;
      }

      case 'HOLD_DRAG_END': {
        const target = this.getActiveTarget();
        if (!target) {
          if (this.lockedWindowId !== null) {
            this.send(this.lockedWindowId, {
              type: 'mouseUp',
              x: this.lockedLocal?.x ?? 0,
              y: this.lockedLocal?.y ?? 0,
              button: 'left',
              clickCount: 1
            });
          }
        } else {
          this.send(target.windowId, {
            type: 'mouseUp',
            x: target.local.x,
            y: target.local.y,
            button: 'left',
            clickCount: 1
          });
        }
        this.dragButtonDown = false;
        this.clearCapture();
        break;
      }

      // ── LOST / RECOVERED ───────────────────────────────────────────────────
      case 'LOST': {
        // End any in-progress gesture.
        if (this.dragButtonDown && this.lockedWindowId !== null) {
          this.send(this.lockedWindowId, {
            type: 'mouseUp',
            x: this.lockedLocal?.x ?? 0,
            y: this.lockedLocal?.y ?? 0,
            button: 'left',
            clickCount: 1
          });
        }
        this.clearCapture();
        break;
      }

      // ── Unused types (routed by InteractionDispatcher) ─────────────────────
      case 'HOVER_ENTER':
      case 'HOVER_LEAVE':
      case 'DWELL_PROGRESS':
      case 'DWELL_CANCEL':
      case 'HOLD_PROGRESS':
      case 'HOLD_DRAG_READY':
      case 'ZOOM_START':
      case 'ZOOM_UPDATE':
      case 'ZOOM_END':
      case 'RECOVERED':
        break;
    }
  }

  private send(windowId: string, event: HandInputEvent): void {
    const api = (window as unknown as {
      api?: {
        webview?: {
          injectInput?: (id: string, ev: unknown) => Promise<boolean>
        }
      }
    }).api;
    if (!api?.webview?.injectInput) {
      console.warn('[WebContentInputDispatcher] api.webview.injectInput not available');
      return;
    }
    void api.webview.injectInput(windowId, event);
  }
}

let instance: WebContentInputDispatcher | null = null;

export function getWebContentInputDispatcher(): WebContentInputDispatcher {
  if (!instance) instance = new WebContentInputDispatcher();
  return instance;
}
