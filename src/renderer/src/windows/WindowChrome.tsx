import { forwardRef, type ReactNode, type PointerEvent as ReactPointerEvent, memo } from 'react';
import styles from './WindowChrome.module.css';
import { useWindowStore } from '@renderer/stores/windowsStore.js';
import { useSettingsStore } from '@renderer/stores/settingsStore.js';
import type { WindowDescriptor } from '@shared/types/index.js';

interface Props {
  window: WindowDescriptor;
  children: ReactNode;
  /** Optional custom drag handle class. */
  dragHandleClass?: string;
}

/**
 * GlassWindow chrome — title bar, drag, resize handles, close button.
 *
 * Native pointer events drive the drag/resize UX. The gesture engine feeds
 * into the same `move()` action when the user pinches and holds (HOLD_DRAG)
 * over the title bar, so the visual experience is consistent.
 */
export const GlassWindow = memo(forwardRef<HTMLDivElement, Props>(function GlassWindow(
  { window: win, children, dragHandleClass },
  ref
) {
  const move = useWindowStore((s) => s.move);
  const resize = useWindowStore((s) => s.resize);
  const close = useWindowStore((s) => s.close);
  const minimize = useWindowStore((s) => s.minimize);
  const restore = useWindowStore((s) => s.restore);
  const maximize = useWindowStore((s) => s.maximize);
  const unmaximize = useWindowStore((s) => s.unmaximize);
  const focus = useWindowStore((s) => s.focus);
  const resetScale = useWindowStore((s) => s.resetScale);

  const zoomMin = useSettingsStore((s) => s.tracking.zoomMin);
  const zoomMax = useSettingsStore((s) => s.tracking.zoomMax);
  const isFocused = useWindowStore((s) => s.focusedId === win.id);

  // Zoom is now applied as discrete steps by the GestureEngine (5-finger
  // gesture). The window keeps its `scale` from the store directly; we
  // don't watch zoomFactor here anymore.

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('button')) return;
    focus(win.id);
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = win.x;
    const originY = win.y;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      move(win.id, originX + dx, originY + dy);
    };
    const onUp = (ev: PointerEvent): void => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    focus(win.id);
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const originW = win.width;
    const originH = win.height;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      resize(win.id, originW + dx, originH + dy);
    };
    const onUp = (ev: PointerEvent): void => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };

  const onResetZoom = (): void => {
    resetScale(win.id);
  };

  return (
    <div
      ref={ref}
      className={`${styles.window} ${win.isActive ? styles.active : ''} ${win.isMinimized ? styles.minimized : ''}`}
      style={{
        transform: `translate(${win.x}px, ${win.y}px) scale(${win.scale})`,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
        transformOrigin: 'top left'
      }}
      onPointerDown={() => focus(win.id)}
      data-window-id={win.id}
    >
      <div
        className={`${styles.title} ${dragHandleClass ?? ''}`}
        onPointerDown={onTitlePointerDown}
      >
        <span className={styles.titleText}>{win.title}</span>
        {win.scale !== 1.0 && (
          <button
            className={`${styles.btn} ${styles.zoomIndicator}`}
            onClick={onResetZoom}
            aria-label={`Reset zoom (${Math.round(win.scale * 100)}%)`}
            title={`Click to reset zoom (${Math.round(win.scale * 100)}%)`}
          >
            {Math.round(win.scale * 100)}%
          </button>
        )}
        <div className={styles.controls}>
          <button
            className={styles.btn}
            onClick={() => (win.isMinimized ? restore(win.id) : minimize(win.id))}
            aria-label={win.isMinimized ? 'Restore' : 'Minimize'}
          >
            {win.isMinimized ? '▢' : '—'}
          </button>
          <button
            className={styles.btn}
            onClick={() => (win.isMaximized ? unmaximize(win.id) : maximize(win.id))}
            aria-label={win.isMaximized ? 'Restore' : 'Maximize'}
          >
            {win.isMaximized ? '❐' : '□'}
          </button>
          <button
            className={`${styles.btn} ${styles.closeBtn}`}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              // Stop pointerdown from bubbling to the title-bar drag handler.
              e.stopPropagation();
            }}
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              window.api?.debug?.log?.(`[CloseBtn] click id=${win.id} appType=${win.appType}`);
              const idToClose = win.id;
              const isBrowser = win.appType === 'browser' || win.appType === 'youtube';

              // For native web content windows, race the destroy against a
              // short timeout. The view may still be loading google.com and
              // its destroy can hang — we must always proceed to close()
              // even if destroy is slow, otherwise the user sees the window
              // stuck open. 600ms is short enough to feel instant yet long
              // enough for a normal teardown on a fast machine.
              if (isBrowser) {
                const destroyPromise = window.api?.webview
                  ?.destroy(idToClose)
                  .catch((err: unknown) => {
                    window.api?.debug?.log?.(`[CloseBtn] destroy rejected: ${String(err)}`);
                  });
                const timeoutPromise = new Promise<void>((resolve) =>
                  window.setTimeout(() => {
                    window.api?.debug?.log?.(`[CloseBtn] destroy timeout — forcing close`);
                    resolve();
                  }, 600)
                );
                await Promise.race([destroyPromise ?? Promise.resolve(), timeoutPromise]);
              }

              close(idToClose);
              window.api?.debug?.log?.(`[CloseBtn] close() called for ${idToClose}`);
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
      {!win.isMinimized && (
        <div className={styles.body}>
          {children}
          <div className={styles.resize} onPointerDown={onResizePointerDown} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14" className={styles.resizeGlyph}>
              <path d="M2 12 L12 2 M6 12 L12 6 M10 12 L12 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}));