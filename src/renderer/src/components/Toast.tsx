import { useEffect, useState, useCallback, type ReactNode } from 'react';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

type Listener = (items: ToastItem[]) => void;

const listeners = new Set<Listener>();
let queue: ToastItem[] = [];
let nextId = 1;

function emit(): void {
  listeners.forEach((cb) => cb(queue));
}

export const toast = {
  show(message: string, tone: ToastTone = 'info', durationMs = 3500): number {
    const id = nextId++;
    queue = [...queue, { id, tone, message }];
    emit();
    window.setTimeout(() => {
      queue = queue.filter((t) => t.id !== id);
      emit();
    }, durationMs);
    return id;
  },
  dismiss(id: number): void {
    queue = queue.filter((t) => t.id !== id);
    emit();
  }
};

export function ToastHost(): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>(queue);

  useEffect(() => {
    const cb: Listener = (next) => setItems(next);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  if (items.length === 0) return <div className={styles.host} aria-live="polite" />;

  return (
    <div className={styles.host} aria-live="polite">
      {items.map((t) => (
        <ToastEntry key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastEntry({ item }: { item: ToastItem }): JSX.Element {
  const onClose = useCallback(() => toast.dismiss(item.id), [item.id]);
  return (
    <div className={`${styles.toast} ${styles[item.tone]}`} role="status">
      <span className={styles.dot} aria-hidden />
      <span className={styles.message}>{item.message}</span>
      <button className={styles.close} onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      {children}
      <ToastHost />
    </>
  );
}