import { useTrackerState } from './useHandTracking.js';
import styles from './TrackingStatusPill.module.css';

/**
 * Small status indicator that reflects the current tracker state.
 * Phase 3 ships the visible pill; subsequent phases will surface richer info.
 */
export function TrackingStatusPill(): JSX.Element {
  const status = useTrackerState((s) => s.status);
  const fps = useTrackerState((s) => s.fps);
  const error = useTrackerState((s) => s.error);

  const tone =
    status === 'running'
      ? 'live'
      : status === 'ready'
        ? 'ready'
        : status === 'error'
          ? 'error'
          : 'idle';

  const label =
    status === 'running'
      ? `Tracking · ${fps.toFixed(0)} fps`
      : status === 'ready'
        ? 'Hand tracker ready'
        : status === 'loading'
          ? 'Loading model…'
          : status === 'error'
            ? `Tracker error${error ? `: ${error}` : ''}`
            : 'Tracker idle';

  return (
    <div className={`${styles.pill} ${styles[tone]}`} aria-live="polite">
      <span className={styles.dot} />
      <span>{label}</span>
    </div>
  );
}