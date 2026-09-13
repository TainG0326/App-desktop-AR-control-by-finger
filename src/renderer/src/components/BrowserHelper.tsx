import { useEffect, useState } from 'react';
import { useToolStore } from '../stores/toolStore.js';
import { useWindowStore } from '../stores/windowsStore.js';
import styles from './BrowserHelper.module.css';

/**
 * Floating browser-helper panel — quick access to Back / Forward / Reload
 * when the user is browsing with hand gestures.
 *
 * Targets the focused window. If the focused window is not a native web
 * content window (Browser or YouTube), the helper shows a hint to focus one.
 */
export function BrowserHelper(): JSX.Element | null {
  const activeTool = useToolStore((s) => s.activeTool);
  const focusedId = useWindowStore((s) => s.focusedId);
  const windows = useWindowStore((s) => s.windows);
  const focused = focusedId ? windows[focusedId] : undefined;
  const isWebContent = !!focused?.hasNativeContent;

  const [state, setState] = useState<{
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    isLoading: boolean;
  }>({
    url: '',
    title: '',
    canGoBack: false,
    canGoForward: false,
    isLoading: false
  });

  // Poll the main process for navigation state (only when tool is active).
  useEffect(() => {
    if (activeTool !== 'browser' || !focusedId || !isWebContent) return;
    let cancelled = false;

    const refresh = async (): Promise<void> => {
      try {
        const s = await window.api?.webview?.getState?.(focusedId);
        if (cancelled || !s) return;
        setState({
          url: s.url,
          title: s.title,
          canGoBack: s.canGoBack,
          canGoForward: s.canGoForward,
          isLoading: s.isLoading
        });
      } catch {
        /* ignore */
      }
    };

    void refresh();
    const id = window.setInterval(refresh, 800);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeTool, focusedId, isWebContent]);

  if (activeTool !== 'browser') return null;

  if (!focused || !isWebContent) {
    return (
      <div className={styles.helper} role="toolbar" aria-label="Trình duyệt">
        <div className={styles.title}>
          <span className={styles.glyph}>⊕</span>
          Trình duyệt
        </div>
        <div className={styles.hint}>
          Mở <strong>Trình duyệt</strong> từ dock và bấm vào để kích hoạt.<br />
          Rồi dùng các phím bên dưới để điều hướng.
        </div>
      </div>
    );
  }

  const handle = (action: 'back' | 'forward' | 'reload' | 'stop'): void => {
    if (!focusedId) return;
    if (action === 'back') void window.api?.webview?.back?.(focusedId);
    else if (action === 'forward') void window.api?.webview?.forward?.(focusedId);
    else if (action === 'reload') void window.api?.webview?.reload?.(focusedId);
  };

  const displayUrl = state.url || '—';
  const title = state.title || focused.title;

  return (
    <div className={styles.helper} role="toolbar" aria-label="Điều khiển trình duyệt">
      <div className={styles.title}>
        <span className={styles.glyph}>⊕</span>
        Trình duyệt
      </div>
      <div className={styles.titleLine} title={title}>{title}</div>
      <div className={styles.urlLine} title={displayUrl}>{displayUrl}</div>
      <div className={styles.buttons}>
        <button
          className={styles.btn}
          onClick={() => handle('back')}
          disabled={!state.canGoBack}
          aria-label="Quay lại"
          data-action="back"
        >‹</button>
        <button
          className={styles.btn}
          onClick={() => handle('forward')}
          disabled={!state.canGoForward}
          aria-label="Tiến tới"
          data-action="forward"
        >›</button>
        <button
          className={`${styles.btn} ${state.isLoading ? styles.btnActive : ''}`}
          onClick={() => handle(state.isLoading ? 'stop' : 'reload')}
          aria-label={state.isLoading ? 'Dừng' : 'Tải lại'}
          data-action={state.isLoading ? 'stop' : 'reload'}
        >{state.isLoading ? '✕' : '↻'}</button>
      </div>
      <div className={styles.hint}>
        Di con trỏ vào trang web và chụm để click. Chụm + kéo ngón để cuộn.
      </div>
    </div>
  );
}
