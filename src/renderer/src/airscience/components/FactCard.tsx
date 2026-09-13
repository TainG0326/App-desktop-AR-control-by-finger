/**
 * FactCard — non-modal floating card for a single ScienceFact.
 *
 * Used by:
 *  - MissionRunner after a mission completes.
 *  - ExploreMode when a science object is selected.
 */

import type { ScienceFact } from '../types.js';
import styles from './FactCard.module.css';

interface FactCardProps {
  fact: ScienceFact;
  /** Show +XP reward chip on top of the card. */
  showReward?: number;
  onClose?: () => void;
}

export function FactCard({ fact, showReward, onClose }: FactCardProps): JSX.Element {
  return (
    <div className={styles.card} role="dialog" aria-label={`Thông tin về ${fact.titleVi}`}>
      {showReward !== undefined && (
        <div className={styles.reward}>+{showReward} XP</div>
      )}
      {onClose && (
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Đóng"
        >
          ✕
        </button>
      )}
      <div className={styles.header}>
        <h2 className={styles.title}>{fact.titleVi}</h2>
        <p className={styles.titleEn}>{fact.titleEn}</p>
      </div>
      <p className={styles.body}>{fact.shortExplanationVi}</p>
      <p className={styles.extended}>{fact.extendedExplanationVi}</p>
      <div className={styles.meta}>
        {fact.reviewStatus === 'draft' && (
          <span className={styles.draftBadge}>Đang xem xét</span>
        )}
        <span>Nguồn: </span>
        <a
          className={styles.source}
          href={fact.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {fact.source}
        </a>
      </div>
    </div>
  );
}
