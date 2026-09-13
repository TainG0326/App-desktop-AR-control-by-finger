import styles from './WindowControls.module.css';

interface WindowControlsProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  className?: string;
}

/**
 * Native-style window control buttons for frameless Electron window.
 * Provides minimize, maximize/restore, and close buttons.
 */
export function WindowControls({ 
  onMinimize, 
  onMaximize, 
  onClose,
  className 
}: WindowControlsProps): JSX.Element {
  return (
    <div className={`${styles.controls} ${className || ''}`} role="group" aria-label="Window controls">
      <button
        className={`${styles.btn} ${styles.minimize}`}
        onClick={onMinimize}
        aria-label="Minimize"
        title="Minimize"
      >
        <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
          <rect width="10" height="2" fill="currentColor" />
        </svg>
      </button>
      
      <button
        className={`${styles.btn} ${styles.maximize}`}
        onClick={onMaximize}
        aria-label="Maximize"
        title="Maximize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </button>
      
      <button
        className={`${styles.btn} ${styles.close}`}
        onClick={onClose}
        aria-label="Close"
        title="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}