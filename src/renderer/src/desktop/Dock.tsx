import { useMemo, useRef, useState, useEffect } from 'react';
import { useWindowStore } from '@renderer/stores/windowsStore.js';
import { getHitZoneManager } from '@renderer/interaction/HitZoneManager.js';
import { motion } from 'framer-motion';
import type { AppType } from '@shared/types/index.js';
import styles from './Dock.module.css';

const ICONS: Record<AppType, string> = {
  youtube: '▶',
  browser: '⊕',
  notes: '✎',
  drawing: '◌',
  settings: '⚙',
  clock: '◴',
  gallery: '▢'
};

const LABELS: Record<AppType, string> = {
  youtube: 'YouTube',
  browser: 'Trình duyệt',
  notes: 'Ghi chú',
  drawing: 'Vẽ',
  settings: 'Cài đặt',
  clock: 'Đồng hồ',
  gallery: 'Thư viện'
};

const ORDER: AppType[] = ['browser', 'youtube', 'notes', 'drawing', 'settings'];

interface DockItemProps {
  appType: AppType;
  onLaunch: () => void;
  isRunning: boolean;
  onHoverChange: (hover: boolean) => void;
}

function DockItem({ appType, onLaunch, isRunning, onHoverChange }: DockItemProps): JSX.Element {
  const ref = useRef<HTMLButtonElement | null>(null);

  return (
    <motion.button
      ref={ref}
      className={`${styles.item} ${isRunning ? styles.running : ''}`}
      onClick={onLaunch}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      whileHover={{ scale: 1.08, y: -6 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      aria-label={`Mở ${LABELS[appType]}`}
    >
      <span className={styles.glyph} aria-hidden>{ICONS[appType]}</span>
      <span className={styles.label}>{LABELS[appType]}</span>
      {isRunning && <span className={styles.indicator} aria-hidden />}
    </motion.button>
  );
}

const SINGLE_INSTANCE_APPS: AppType[] = ['youtube', 'browser', 'settings'];

export function Dock(): JSX.Element {
  const open = useWindowStore((s) => s.open);
  const focus = useWindowStore((s) => s.focus);
  const restore = useWindowStore((s) => s.restore);
  const windows = useWindowStore((s) => s.windows);
  const order = useWindowStore((s) => s.order);
  const dockRef = useRef<HTMLDivElement>(null);

  const openByType = useWindowStore((s) => {
    const map: Partial<Record<AppType, number>> = {};
    for (const id of s.order) {
      const w = s.windows[id];
      if (w) map[w.appType] = (map[w.appType] ?? 0) + 1;
    }
    return map;
  });

  const [hovered, setHovered] = useState<AppType | null>(null);

  // Feed dock bounds to HitZoneManager for proper pointer routing.
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const hitZone = getHitZoneManager();

    const updateBounds = (): void => {
      const rect = el!.getBoundingClientRect();
      hitZone.updateDockBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      });
    };

    updateBounds();

    const ro = new ResizeObserver(updateBounds);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = useMemo(() => ORDER.map((t) => ({
    type: t,
    isRunning: (openByType[t] ?? 0) > 0
  })), [openByType]);

  const handleLaunch = (appType: AppType): void => {
    // Find existing window of this type
    const existingId = order.find((id) => windows[id]?.appType === appType);
    
    if (existingId && SINGLE_INSTANCE_APPS.includes(appType)) {
      // Single-instance app: focus existing window
      const existingWindow = windows[existingId];
      focus(existingId);
      if (existingWindow?.isMinimized) {
        restore(existingId);
      }
    } else {
      // Multi-instance or no existing: open new
      open({ type: appType });
    }
  };

  return (
    <motion.div
      ref={dockRef}
      className={styles.dock}
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.18, 0.89, 0.32, 1.18] }}
      role="toolbar"
      aria-label="App dock"
    >
      <div className={styles.bar}>
        {items.map((it) => (
          <DockItem
            key={it.type}
            appType={it.type}
            isRunning={it.isRunning}
            onLaunch={() => handleLaunch(it.type)}
            onHoverChange={(h) => setHovered(h ? it.type : hovered === it.type ? null : hovered)}
          />
        ))}
      </div>
    </motion.div>
  );
}