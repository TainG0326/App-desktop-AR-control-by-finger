import { useEffect, useState } from 'react';
import styles from './CinematicIntro.module.css';

interface Props {
  /** Total duration in ms. */
  durationMs?: number;
  onComplete?: () => void;
}

/**
 * Cinematic intro animation shown for ~3 seconds when the renderer first
 * mounts. Pure CSS keyframes; no external dependencies.
 */
export function CinematicIntro({ durationMs = 3000, onComplete }: Props): JSX.Element | null {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [durationMs, onComplete]);

  if (!visible) return null;

  return (
    <div className={styles.shell} role="presentation">
      <div className={styles.logo}>
        <span className={styles.ring} />
        <span className={styles.core} />
      </div>
      <h1 className={styles.title}>AirVision Desktop</h1>
      <p className={styles.subtitle}>Spatial computing through your camera.</p>
    </div>
  );
}