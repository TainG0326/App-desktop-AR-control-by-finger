/**
 * MissionIntro — full-screen overlay shown when a mission begins.
 *
 * Mentions the title, a short description, and 1–3 numbered steps.
 * The "Bắt đầu" button dismisses it; the actual drag/click scene
 * underneath is not interactive while the overlay is up.
 */

import type { Mission } from '../types.js';
import styles from './MissionIntro.module.css';

interface MissionIntroProps {
  mission: Mission;
  /** Emoji / symbol that hints at the world. e.g. '🪐'. */
  glyph?: string;
  onStart: () => void;
}

export function MissionIntro({ mission, glyph = '✨', onStart }: MissionIntroProps): JSX.Element {
  return (
    <div className={styles.intro} role="dialog" aria-labelledby="mission-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden>{glyph}</div>
        <h1 className={styles.title} id="mission-title">{mission.title}</h1>
        <p className={styles.description}>{mission.description}</p>
        <ol className={styles.steps}>
          {mission.instructions.map((step, i) => (
            <li key={i} className={styles.step}>
              <span className={styles.stepIndex}>{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <button type="button" className={styles.startBtn} onClick={onStart}>
          Bắt đầu →
        </button>
      </div>
    </div>
  );
}
