import type { ReactNode } from 'react';
import styles from './GlassPanel.module.css';

export interface GlassPanelProps {
  children: ReactNode;
  /** Title displayed at the top of the panel. */
  title?: string;
  /** Visual elevation 0..3; controls shadow + blur. */
  elevation?: 0 | 1 | 2 | 3;
  /** Optional className. */
  className?: string;
  /** Padding override. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Render as a different element. */
  as?: keyof JSX.IntrinsicElements;
  /** Optional close handler. */
  onClose?: () => void;
}

/**
 * Reusable translucent glass surface.
 *
 * Visual identity:
 *   - backdrop-filter blur
 *   - subtle border + inner highlight
 *   - restrained shadow
 */
export function GlassPanel({
  children,
  title,
  elevation = 1,
  className,
  padding = 'md',
  as: Tag = 'div',
  onClose
}: GlassPanelProps): JSX.Element {
  const TagAny = Tag as 'div';
  return (
    <TagAny
      className={[
        styles.panel,
        styles[`elevation-${elevation}`],
        styles[`padding-${padding}`],
        className ?? ''
      ].join(' ')}
    >
      {title && (
        <header className={styles.header}>
          <span className={styles.headerText}>{title}</span>
          {onClose && (
            <button
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Đóng"
              type="button"
            >
              ×
            </button>
          )}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </TagAny>
  );
}