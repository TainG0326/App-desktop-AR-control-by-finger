/**
 * WorldShell — chrome that wraps every world (Space, Animals, Body).
 *
 * Provides:
 *  - Back to home button.
 *  - World title + subtitle.
 *  - Mission / Explore mode toggle (only when world is selected).
 *  - XP badge for child motivation.
 *  - A scene container that the world content fills.
 */

import type { ReactNode } from 'react';
import { useWorldBridge } from '../worldBridge.js';
import { useProgressStore } from '../stores/progressStore.js';
import styles from './WorldShell.module.css';

interface WorldShellProps {
  title: string;
  subtitle: string;
  /** Show the mission/explore mode toggle. */
  showModeToggle?: boolean;
  /** Mission-list picker shown next to the mode toggle. */
  missionPicker?: ReactNode;
  children: ReactNode;
}

export function WorldShell({
  title,
  subtitle,
  showModeToggle = true,
  missionPicker,
  children
}: WorldShellProps): JSX.Element {
  const goHome = useWorldBridge((s) => s.goHome);
  const mode = useWorldBridge((s) => s.mode);
  const setMode = useWorldBridge((s) => s.setMode);
  const xp = useProgressStore((s) => s.xp);

  return (
    <div className={styles.worldShell}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => goHome()}
          aria-label="Quay về trang chủ"
        >
          ← Trang chủ
        </button>

        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>

        {missionPicker}

        {showModeToggle && (
          <div className={styles.modeToggle} role="tablist">
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'mission' ? styles.active : ''}`}
              onClick={() => setMode('mission')}
              aria-pressed={mode === 'mission'}
            >
              Nhiệm vụ
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'explore' ? styles.active : ''}`}
              onClick={() => setMode('explore')}
              aria-pressed={mode === 'explore'}
            >
              Khám phá
            </button>
          </div>
        )}

        <div className={styles.xpBadge} aria-label={`XP hiện tại: ${xp}`}>
          ⭐ {xp} XP
        </div>
      </div>

      <div className={styles.scene}>{children}</div>
    </div>
  );
}
