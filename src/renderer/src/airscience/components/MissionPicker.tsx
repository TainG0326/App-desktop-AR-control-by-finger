import { missionEngine } from '../engines/missionEngine.js';
import type { Mission } from '../types.js';
import styles from './MissionPicker.module.css';

interface MissionPickerProps {
  worldId: 'space' | 'animals' | 'human-body';
  /** id of mission currently active. */
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function MissionPicker({ worldId, activeId, onSelect }: MissionPickerProps): JSX.Element {
  const all = missionEngine.list().filter((m) => m.worldId === worldId);
  if (all.length === 0) return <div />;

  return (
    <div className={styles.picker} role="tablist" aria-label="Chọn nhiệm vụ">
      {all.map((m: Mission, idx) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={m.id === activeId}
          className={`${styles.chip} ${m.id === activeId ? styles.active : ''}`}
          onClick={() => onSelect(m.id)}
        >
          {idx + 1}. {m.title}
        </button>
      ))}
    </div>
  );
}
