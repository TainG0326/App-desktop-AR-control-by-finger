import type { ReactNode } from 'react';
import { GlassPanel } from './GlassPanel.js';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <GlassPanel padding="lg" className={styles.shell}>
      <div className={styles.glyph} aria-hidden />
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </GlassPanel>
  );
}