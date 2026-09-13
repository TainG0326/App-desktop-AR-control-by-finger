import { useEffect, useRef } from 'react';
import { GlassWindow } from './WindowChrome.js';
import { useWindowStore } from '@renderer/stores/windowsStore.js';
import type { AppType } from '@shared/types/index.js';

export interface AppHostProps {
  appType: AppType;
  /** Render the app body for the given window id. */
  render: (id: string) => React.ReactNode;
}

/**
 * WindowManager renders every open window in z-order, hosts their
 * chrome, and mounts their content via the `render` callback.
 *
 * DESIGN NOTE: We intentionally do NOT auto-restore the saved window
 * layout on startup. Previous design called `loadLayout()` in a
 * useEffect on first mount, which caused several cascading bugs:
 *
 *   - Stale layout (e.g. isMaximized:true from a previous crash)
 *     would force-open windows the user couldn't dismiss because
 *     the corresponding WebContentsView in the main process had
 *     never been created — the destroy call would hang on close.
 *   - Maximized windows restored with old bounds fought the
 *     main-window resize effect, leaving content misaligned.
 *   - Multiple restored windows grabbed the camera and CPU at
 *     startup, causing "camera broken" on first launch.
 *   - Saving the layout on every change (including close) meant a
 *     bad state could persist across launches indefinitely.
 *
 * New policy: app always starts with an empty desktop. The user
 * opens windows explicitly from the dock. Window positions are
 * still saved (so a future feature can offer "restore last
 * session" if needed) but nothing is auto-restored.
 *
 * If you ever want to restore, call `useWindowStore.getState()
 * .restoreFromSnapshot(snap)` explicitly — typically behind a
 * confirmation dialog.
 */
export function WindowManager({ appType, render }: AppHostProps): JSX.Element {
  const windows = useWindowStore((s) => s.windows);
  const order = useWindowStore((s) => s.order);

  // Clear any persisted layout on startup so a corrupted or stale
  // snapshot can't come back to haunt the next launch. This is a
  // one-time effect per WindowManager mount; subsequent mounts of
  // the host (e.g. debugging hot-reloads) keep the same ref so we
  // don't wipe the disk on every code reload.
  const didClearStaleLayout = useRef(false);
  useEffect(() => {
    if (didClearStaleLayout.current) return;
    didClearStaleLayout.current = true;
    // Best-effort wipe. Don't block UI on this — it's a hygiene
    // measure, not a correctness requirement, and the user won't
    // notice either way (no auto-restore).
    void window.api?.windows.saveLayout({ windows: [], focusedId: null });
  }, []);

  // Persist layout on changes (still useful for future explicit
  // restore feature, but never auto-loaded).
  useEffect(() => {
    const unsub = useWindowStore.subscribe(
      (s) => s.layoutSnapshot(),
      (snap) => {
        // Always save — including the empty layout — so that
        // closing the last window persists as "no windows".
        void window.api?.windows.saveLayout(snap);
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );
    return () => unsub();
  }, []);

  return (
    <>
      {order.map((id) => {
        const w = windows[id];
        if (!w) return null;
        if (w.appType !== appType) return null;
        return (
          <GlassWindow key={id} window={w}>
            {render(id)}
          </GlassWindow>
        );
      })}
    </>
  );
}
