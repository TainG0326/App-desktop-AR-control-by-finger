import { useEffect } from 'react';
import { getGestureEngine } from '@renderer/gestures/GestureEngine.js';
import { useGestureState } from '@renderer/gestures/useGesture.js';
import styles from './GestureStatusPill.module.css';

const LABELS: Record<string, string> = {
  IDLE: 'Gesture idle',
  TRACKING: 'Tracking',
  HOVERING: 'Hovering',
  DWELLING: 'Dwelling',
  PRESSING: 'Pressing',
  DRAGGING: 'Dragging',
  HOLD_DRAG: 'Hold-drag ready',
  HOLD_DRAGGING: 'Hold-dragging',
  ZOOMING: 'Zooming',
  LOST_TRACKING: 'Tracking lost'
};

function GestureBridge(): null {
  useEffect(() => {
    getGestureEngine();
  }, []);
  return null;
}

export function GestureStatusPill(): JSX.Element {
  const state = useGestureState();
  const label = LABELS[state] ?? state;
  const tone =
    state === 'PRESSING' || state === 'DRAGGING' ||
    state === 'HOLD_DRAG' || state === 'HOLD_DRAGGING' || state === 'ZOOMING'
      ? 'active'
      : state === 'DWELLING'
        ? 'dwell'
        : state === 'HOVERING'
          ? 'hover'
          : state === 'LOST_TRACKING'
            ? 'lost'
            : 'idle';
  return (
    <div className={`${styles.pill} ${styles[tone]}`} aria-live="polite">
      <span className={styles.dot} />
      <span>{label}</span>
    </div>
  );
}

export { GestureBridge };