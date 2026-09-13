import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './GlassButton.module.css';

export type GlassButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type GlassButtonSize = 'sm' | 'md' | 'lg';

export interface GlassButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: GlassButtonVariant;
  size?: GlassButtonSize;
  /** Show a small status dot on the right. */
  indicator?: boolean;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  function GlassButton(
    { children, variant = 'secondary', size = 'md', indicator, className, ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={[styles.button, styles[variant], styles[size], className ?? ''].join(' ')}
        {...rest}
      >
        <span className={styles.label}>{children}</span>
        {indicator && <span className={styles.indicator} aria-hidden />}
      </button>
    );
  }
);