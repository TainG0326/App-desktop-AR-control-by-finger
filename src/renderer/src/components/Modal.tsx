import type { ReactNode } from 'react';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  title?: string;
  onClose?: () => void;
  children: ReactNode;
}

/**
 * Centered glass modal with backdrop scrim.
 *
 * Used for onboarding, calibration wizard, and confirmations.
 */
export function Modal({ open, title, onClose, children }: ModalProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div className={styles.scrim} role="dialog" aria-modal>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {onClose && (
            <button className={styles.close} onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}