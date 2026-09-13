import { useEffect, useRef, useState } from 'react';
import { pointerRef } from '../stores/pointerStore.js';
import { getGestureEngine } from '../gestures/GestureEngine.js';
import { useGestureStore } from '../stores/gestureStore.js';
import type { GestureEvent } from '../gestures/stateMachine.js';
import type { ZoomPhase } from '../stores/gestureStore.js';

// NOTE: styles and ring refs are no longer needed — cursor rendering lives
// in CursorOverlay BrowserWindow. This component sends IPC state only.

export interface SpatialCursorProps {
  className?: string;
  /** ms the cursor must rest over a target to fire a CLICK (dwell). */
  dwellMs?: number;
  /** ms of continuous pinch required to enter HOLD_DRAG mode. */
  holdDragMs?: number;
}

const INNER_RADIUS = 12;
const OUTER_RADIUS = 18;
const INNER_CIRCUM = 2 * Math.PI * INNER_RADIUS;
const OUTER_CIRCUM = 2 * Math.PI * OUTER_RADIUS;

/**
 * The hand cursor visual with dwell + pinch rings.
 *
 * Architecture:
 * - React state controls ring VISIBILITY (mounted/unmounted SVG). This is
 *   reliable and follows React's normal rendering lifecycle.
 * - Refs + RAF controls ring PROGRESS (strokeDashoffset). This avoids
 *   React re-renders at 60 Hz while keeping smooth animation.
 *
 * The FSM is subscribed to directly so we get a clean, ordered event stream
 * without interference from unrelated store updates.
 */
export function SpatialCursor({
  className,
  dwellMs = 800,
  holdDragMs = 3000
}: SpatialCursorProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  // React state for ring visibility — drives the overlay IPC payload.
  const [showDwell, setShowDwell] = useState(false);
  const [showHold, setShowHold] = useState(false);
  const [holdArmed, setHoldArmed] = useState(false);
  const [dwellColor, setDwellColor] = useState('rgba(255, 182, 106, 0.95)');
  const [holdColor, setHoldColor] = useState('rgba(255, 182, 106, 0.85)');
  const [zoomPhase, setZoomPhase] = useState<ZoomPhase>('IDLE');
  const [zoomDirection, setZoomDirection] = useState<'in' | 'out' | null>(null);

  // Subscribe to zoom phase from gesture store
  useEffect(() => {
    const unsubscribe = useGestureStore.subscribe(
      (state) => state.zoomPhase,
      (phase) => setZoomPhase(phase)
    );
    return unsubscribe;
  }, []);

  // Subscribe to zoom direction from gesture store
  useEffect(() => {
    const unsubscribe = useGestureStore.subscribe(
      (state) => [state.zoomMovedOutward, state.zoomMovedInward] as const,
      ([outward, inward]) => {
        if (outward > inward) {
          setZoomDirection('in');
        } else if (inward > outward) {
          setZoomDirection('out');
        } else {
          setZoomDirection(null);
        }
      }
    );
    return unsubscribe;
  }, []);

  // Refs for progress (updated by FSM events, read by RAF loop).
  const dwellProgressRef = useRef(0);
  const holdProgressRef = useRef(0);
  const prevModeRef = useRef<'IDLE' | 'DWELLING' | 'HOLD' | 'HOLD_ARMED' | 'PINCH'>('IDLE');

  // Subscribe to FSM events.
  useEffect(() => {
    const fsm = getGestureEngine().getFsm();
    const unsubscribe = fsm.onEvent((e: GestureEvent) => {
      const prevMode = prevModeRef.current;

      switch (e.type) {
        case 'HOVER_ENTER': {
          // Enter hovering — show dwell ring.
          setShowDwell(true);
          setShowHold(false);
          setHoldArmed(false);
          dwellProgressRef.current = 0;
          prevModeRef.current = 'DWELLING';
          break;
        }
        case 'HOVER_LEAVE': {
          // Left the target — hide rings.
          setShowDwell(false);
          setShowHold(false);
          setHoldArmed(false);
          dwellProgressRef.current = 0;
          holdProgressRef.current = 0;
          prevModeRef.current = 'IDLE';
          break;
        }
        case 'DWELL_PROGRESS': {
          // Dwell is progressing — update ref (RAF reads it for smooth animation).
          if (prevModeRef.current === 'DWELLING') {
            dwellProgressRef.current = Math.max(0, Math.min(1, e.progress));
            const color = e.progress >= 1
              ? 'rgba(106, 255, 169, 0.95)'
              : 'rgba(255, 182, 106, 0.95)';
            setDwellColor(color);
          }
          break;
        }
        case 'DWELL_CANCEL': {
          if (prevModeRef.current === 'DWELLING') {
            setShowDwell(false);
            dwellProgressRef.current = 0;
            prevModeRef.current = 'IDLE';
          }
          break;
        }
        case 'CLICK': {
          // Reset ring immediately.
          dwellProgressRef.current = 0;
          setDwellColor('rgba(255, 182, 106, 0.95)');
          break;
        }
        case 'HOLD_PROGRESS': {
          // User has pinched and is holding — show outer hold ring.
          if (prevModeRef.current !== 'HOLD_ARMED') {
            prevModeRef.current = 'HOLD';
            setShowHold(true);
            setShowDwell(false);
            setHoldArmed(false);
            holdProgressRef.current = 0;
          }
          holdProgressRef.current = Math.max(0, Math.min(1, e.progress));
          const color = e.progress >= 1
            ? 'rgba(106, 255, 169, 0.85)'
            : 'rgba(255, 182, 106, 0.85)';
          setHoldColor(color);
          break;
        }
        case 'HOLD_DRAG_READY': {
          prevModeRef.current = 'HOLD_ARMED';
          setHoldArmed(true);
          holdProgressRef.current = 1;
          setHoldColor('rgba(106, 255, 169, 0.85)');
          break;
        }
        case 'HOLD_DRAG_MOVE':
        case 'HOLD_DRAG_END': {
          if (prevModeRef.current !== 'HOLD_ARMED') {
            prevModeRef.current = 'HOLD_ARMED';
            setShowHold(true);
            setHoldArmed(true);
            holdProgressRef.current = 1;
          }
          if (e.type === 'HOLD_DRAG_END') {
            setShowHold(false);
            setHoldArmed(false);
            holdProgressRef.current = 0;
            prevModeRef.current = 'IDLE';
          }
          break;
        }
        case 'DRAG_START': {
          // Drag started while holding — keep hold armed state.
          if (prevModeRef.current !== 'HOLD_ARMED') {
            prevModeRef.current = 'HOLD_ARMED';
            setShowHold(true);
            setHoldArmed(true);
            holdProgressRef.current = 1;
          }
          break;
        }
        case 'DRAG_END': {
          setShowHold(false);
          setHoldArmed(false);
          holdProgressRef.current = 0;
          prevModeRef.current = 'IDLE';
          break;
        }
        case 'LOST':
        case 'RECOVERED': {
          // Hand lost/recovered — keep ring state stable.
          break;
        }
        default:
          break;
      }
    });
    return unsubscribe;
  }, []);

  void dwellMs;
  void holdDragMs;

  // ── Overlay integration: send cursor state to the overlay window via IPC ──
  useEffect(() => {
    let lastSent = '';
    const sendOverlayState = (): void => {
      const state = {
        visible: pointerRef.visible,
        x: pointerRef.position.x,
        y: pointerRef.position.y,
        showDwell,
        showHold,
        holdArmed,
        dwellColor,
        holdColor,
        zoomPhase,
        zoomDirection,
        dwellProgress: dwellProgressRef.current,
        holdProgress: holdProgressRef.current,
      };
      const key = JSON.stringify(state);
      if (key !== lastSent) {
        lastSent = key;
        window.api?.cursor.sendState(state);
      }
    };

    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      sendOverlayState();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showDwell, showHold, holdArmed, dwellColor, holdColor, zoomPhase, zoomDirection]);

  void dwellMs;
  void holdDragMs;

  /**
   * Cursor renders in CursorOverlay BrowserWindow — see overlay/index.html.
   * This div is kept (with display:none) so React's component tree stays valid.
   */
  return (
    <div
      ref={ref}
      className={className}
      aria-hidden
      style={{ display: 'none' }}
    />
  );
}