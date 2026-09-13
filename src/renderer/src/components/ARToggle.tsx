import { useSettingsStore } from '../stores/settingsStore.js';
import styles from './ARToggle.module.css';

/**
 * Toggle button to enable/disable AR hand control mode.
 * When disabled, normal mouse/keyboard interaction works.
 * When enabled, hand gestures control the cursor.
 */
export function ARToggle(): JSX.Element {
  const enabled = useSettingsStore((s) => s.tracking.enabled);
  const update = useSettingsStore((s) => s.update);

  const handleToggle = () => {
    void update({ tracking: { ...useSettingsStore.getState().tracking, enabled: !enabled } });
  };

  return (
    <div
      className={styles.toggle}
      onClick={handleToggle}
      data-enabled={enabled}
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle AR hand control"
      title={enabled ? 'Tắt điều khiển AR (dùng chuột bình thường)' : 'Bật điều khiển AR bằng tay'}
    >
      <span className={styles.icon}>🤚</span>
      <span className={styles.label}>AR Mode</span>
      <div className={styles.switch} />
    </div>
  );
}
