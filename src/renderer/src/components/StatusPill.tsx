import styles from './StatusPill.module.css';

export interface StatusPillProps {
  tone?: 'idle' | 'live' | 'ready' | 'success' | 'warning' | 'error';
  label: string;
}

export function StatusPill({ tone = 'idle', label }: StatusPillProps): JSX.Element {
  return (
    <div className={`${styles.pill} ${styles[tone]}`}>
      <span className={styles.dot} />
      <span>{label}</span>
    </div>
  );
}