/**
 * AirScience Home — the camera-first landing screen.
 *
 * - Camera remains visible underneath (managed in App.tsx).
 * - Three world portals: Space, Animals, Human Body.
 * - Live worlds route to their renderer; coming-soon worlds show a
 *   soft "sắp ra mắt" message.
 * - XP badge in the top corner.
 */

import { WORLDS } from '../worlds/registry.js';
import { useWorldBridge } from '../worldBridge.js';
import { useProgressStore } from '../stores/progressStore.js';
import styles from './Home.module.css';

export function Home(): JSX.Element | null {
  const screen = useWorldBridge((s) => s.screen);
  const openWorld = useWorldBridge((s) => s.openWorld);
  const xp = useProgressStore((s) => s.xp);
  const totalDiscoveries = useProgressStore((s) => s.totalDiscoveries)();

  if (screen !== 'home') return null;

  return (
    <div className={styles.home}>
      <div className={styles.brand}>
        <h1 className={styles.title}>AirScience</h1>
        <p className={styles.subtitle}>Khám phá khoa học bằng đôi tay của em</p>
        <div className={styles.xpRow}>
          <span>⭐ {xp} XP</span>
          <span aria-hidden>·</span>
          <span>Đã phát hiện {totalDiscoveries} đối tượng</span>
        </div>
      </div>

      <div className={styles.portals}>
        {WORLDS.map((world) => {
          const isLive = world.status === 'live';
          return (
            <button
              key={world.id}
              type="button"
              className={`${styles.portal} ${isLive ? '' : styles.comingSoon}`}
              onClick={() => {
                if (isLive) openWorld(world.id);
              }}
              aria-label={`Mở thế giới ${world.label}`}
              data-world-id={world.id}
            >
              <span
                className={`${styles.badge} ${isLive ? styles.badgeLive : styles.badgeSoon}`}
              >
                {isLive ? 'Đã có' : 'Sắp ra mắt'}
              </span>
              <span className={styles.portalGlyph} aria-hidden>
                {world.glyph}
              </span>
              <h2 className={styles.portalLabel}>{world.label}</h2>
              <p className={styles.portalSubtitle}>{world.subtitle}</p>
            </button>
          );
        })}
      </div>

      <div className={styles.hint}>Bóp ngón cái và ngón trỏ để chọn.</div>
    </div>
  );
}
