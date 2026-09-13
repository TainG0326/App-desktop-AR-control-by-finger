import { useGestureStore } from '../stores/gestureStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import styles from './GestureDebugIndicator.module.css';

const ZOOM_PHASE_HINTS: Record<string, { text: string; tone: 'idle' | 'active' | 'dwell' | 'zoom' }> = {
  IDLE: { text: '🖐 Push/pull hand toward camera to zoom', tone: 'idle' },
  TRACKING: { text: '🖐 Pushing forward = zoom in | Pulling back = zoom out', tone: 'zoom' },
  COOLDOWN: { text: '🖐 Cooldown — return hand to neutral distance', tone: 'dwell' }
};

const PINCH_STATE_HINTS: Record<string, { text: string; tone: 'idle' | 'active' | 'dwell' }> = {
  OPEN: { text: '✋ Pinch thumb + index finger to drag', tone: 'idle' },
  PINCH_START: { text: '🤏 Pinch detected — move to drag', tone: 'active' },
  PINCH_HOLD: { text: '✋ Hold pinch + move cursor to drag', tone: 'active' },
  PINCH_RELEASE: { text: '✋ Release to end drag', tone: 'dwell' }
};

/**
 * Live gesture debug indicator showing pinch distance, FSM state, and
 * 5-finger zoom detector phase. Only visible when tracking.showDebug = true.
 */
export function GestureDebugIndicator(): JSX.Element | null {
  const showDebug = useSettingsStore((s) => s.tracking.showDebug);
  const pinchDistance = useGestureStore((s) => s.pinchDistanceNorm);
  const pinchState = useGestureStore((s) => s.pinchState);
  const fsmState = useGestureStore((s) => s.fsmState);
  const zoomPhase = useGestureStore((s) => s.zoomPhase);

  if (!showDebug) return null;

  const pinchPercent = Math.min(100, (pinchDistance ?? 0) * 100);
  const zoomHint = ZOOM_PHASE_HINTS[zoomPhase] ?? ZOOM_PHASE_HINTS.IDLE;
  const pinchHint = PINCH_STATE_HINTS[pinchState] ?? PINCH_STATE_HINTS.OPEN;

  // Determine main hint based on state
  const isZoomActive = zoomPhase === 'TRACKING';
  const isPinchActive = pinchState === 'PINCH_START' || pinchState === 'PINCH_HOLD';
  const isDragging = fsmState === 'DRAGGING' || fsmState === 'HOLD_DRAG' || fsmState === 'HOLD_DRAGGING';

  return (
    <div className={styles.indicator}>
      <div className={styles.row}>
        <span className={styles.label}>Pinch State:</span>
        <span className={styles.state} data-state={pinchState}>
          {pinchState}
        </span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>FSM:</span>
        <span className={styles.value}>{fsmState}</span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Distance:</span>
        <span className={styles.value}>{(pinchDistance ?? 0).toFixed(3)}</span>
      </div>

      <div className={styles.bar}>
        <div
          className={styles.fill}
          style={{ width: `${pinchPercent}%` }}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Depth Zoom:</span>
        <span
          className={styles.state}
          data-state={zoomPhase === 'TRACKING' ? 'PINCH_HOLD' : zoomPhase === 'COOLDOWN' ? 'PINCH_RELEASE' : 'OPEN'}
        >
          {zoomPhase}
          {zoomPhase === 'TRACKING' && (
            <> tracking depth...</>
          )}
        </span>
      </div>

      {/* Main hint section - shows the most relevant action */}
      <div className={styles.hintSection}>
        {isDragging && (
          <div className={`${styles.hint} ${styles.active}`}>
            🖐 Dragging — release pinch to stop
          </div>
        )}
        {isZoomActive && (
          <div className={`${styles.hint} ${styles.zoom}`}>
            {zoomDirectionText()} to zoom
          </div>
        )}
        {!isDragging && !isZoomActive && fsmState === 'DWELLING' && (
          <div className={`${styles.hint} ${styles.dwell}`}>
            🟧 Hold still — dwell click in progress
          </div>
        )}
        {!isDragging && !isZoomActive && fsmState === 'HOVERING' && (
          <div className={`${styles.hint} ${styles.idle}`}>
            👆 Hover over a target and hold still to click
          </div>
        )}
        {!isDragging && !isZoomActive && isPinchActive && (
          <div className={`${styles.hint} ${styles.active}`}>
            ✋ Pinch + move = drag | Release + move cursor = hold-drag
          </div>
        )}
      </div>

      {/* Detailed hints */}
      <div className={styles.hint} data-tone={pinchHint.tone}>
        {pinchHint.text}
      </div>
      <div className={`${styles.hint} ${styles[zoomHint.tone]}`}>
        {zoomHint.text}
      </div>

      <div className={styles.hint} style={{ opacity: 0.6, fontSize: '0.75em' }}>
        Press F12 to hide debug overlay
      </div>
    </div>
  );
}

function zoomDirectionText(): string {
  return '🖐 Push toward camera = zoom in | Pull away = zoom out';
}
