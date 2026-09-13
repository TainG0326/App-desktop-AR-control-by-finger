import { useEffect, useRef, useState } from 'react';
import { useWindowStore } from '@renderer/stores/windowsStore.js';
import { getWebContentInputDispatcher } from '@renderer/interaction/WebContentInputDispatcher.js';
import type { Rectangle } from '@renderer/types/api.d.js';
import styles from './BrowserApp.module.css';

interface BrowserAppNativeProps {
  windowId: string;
}

export function BrowserAppNative({ windowId }: BrowserAppNativeProps): JSX.Element {
  const win = useWindowStore((s) => s.windows[windowId]);
  const viewCreatedRef = useRef(false);
  const [inputValue, setInputValue] = useState('https://www.google.com/webhp?igu=1');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack] = useState(false);
  const [canGoForward] = useState(false);

  // 1) Mount/unmount lifecycle
  useEffect(() => {
    viewCreatedRef.current = true;

    const createView = async (): Promise<void> => {
      const initial = useWindowStore.getState().windows[windowId];
      if (!initial) {
        viewCreatedRef.current = false;
        return;
      }

      try {
        const titleBarHeight = 38;
        const urlBarHeight = 38;
        const borders = { left: 2, right: 2, top: 2, bottom: 2 };

        // The WebContentManager re-derives the actual WebContentsView bounds
        // from the WINDOW bounds plus `extraTopOffset` so the view never
        // covers the React chrome. The URL bar lives in the React layer, so
        // we tell the manager to push the view down by urlBarHeight as well.
        await window.api?.webview.create(
          windowId,
          'browser',
          {
            x: initial.x,
            y: initial.y,
            width: initial.width,
            height: initial.height
          },
          urlBarHeight
        );

        // HitZoneManager computes contentArea from windowStore so that
        // InputRouter can route events correctly. Here we only need to tell
        // the dispatcher the same rect (local coords relative to viewport).
        // Matches HitZoneManager: y = window.y + 38(title) + 38(URL bar) + 2(border).
        const contentBounds: Rectangle = {
          x: Math.floor(initial.x + borders.left),
          y: Math.floor(initial.y + titleBarHeight + urlBarHeight + borders.top),
          width: Math.floor(initial.width - borders.left - borders.right),
          height: Math.floor(initial.height - titleBarHeight - urlBarHeight - borders.top - borders.bottom)
        };
        getWebContentInputDispatcher().updateContentBounds(windowId, contentBounds);
        console.log(`[BrowserNative] ✓ Created WebContentsView for ${windowId}`);
      } catch (err) {
        console.error('[BrowserNative] ✗ Failed to create view:', err);
        viewCreatedRef.current = false;
      }
    };

    void createView();

    return () => {
      console.log(`[BrowserNative] Destroying WebContentsView for ${windowId}`);
      void window.api?.webview.destroy(windowId);
      viewCreatedRef.current = false;
    };
  }, [windowId]);

  // 2) Sync bounds on geometry change
  useEffect(() => {
    if (!win) return;
    const titleBarHeight = 38;
    const urlBarHeight = 38;
    const borders = { left: 2, right: 2, top: 2, bottom: 2 };

    // Window-level bounds go to the manager; it subtracts the chrome itself.
    void window.api?.webview.updateBounds(windowId, {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height
    });

    // Dispatcher needs the actual WebContentsView rect.
    const contentBounds: Rectangle = {
      x: Math.floor(win.x + borders.left),
      y: Math.floor(win.y + titleBarHeight + urlBarHeight + borders.top),
      width: Math.floor(win.width - borders.left - borders.right),
      height: Math.floor(win.height - titleBarHeight - urlBarHeight - borders.top - borders.bottom)
    };
    getWebContentInputDispatcher().updateContentBounds(windowId, contentBounds);
  }, [windowId, win?.x, win?.y, win?.width, win?.height]);

  // 3) Visibility on minimize toggle
  useEffect(() => {
    if (!win) return;
    void window.api?.webview.setVisible(windowId, !win.isMinimized);
  }, [windowId, win?.isMinimized]);

  const handleNavigate = (): void => {
    let target = inputValue.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        target = 'https://www.google.com/search?igu=1&q=' + encodeURIComponent(target);
      }
    }
    setIsLoading(true);
    void window.api?.webview.navigate(windowId, target);
  };

  const handleBack = (): void => {
    void window.api?.webview.back(windowId);
  };

  const handleForward = (): void => {
    void window.api?.webview.forward(windowId);
  };

  const handleReload = (): void => {
    void window.api?.webview.reload(windowId);
    setIsLoading(true);
  };

  return (
    <div className={styles.browser}>
      {/* URL bar */}
      <div className={styles.urlBar}>
        <button
          className={styles.navBtn}
          onClick={handleBack}
          disabled={!canGoBack}
          title="Quay lại"
        >
          ‹
        </button>
        <button
          className={styles.navBtn}
          onClick={handleForward}
          disabled={!canGoForward}
          title="Tiến tới"
        >
          ›
        </button>
        <button
          className={styles.navBtn}
          onClick={handleReload}
          title="Tải lại"
        >
          ↻
        </button>
        <input
          className={styles.urlInput}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNavigate();
          }}
          placeholder="Nhập URL hoặc tìm kiếm..."
        />
      </div>
      {/* Content area placeholder — WebContentsView renders in the native layer */}
      <div className={styles.content}>
        <div className={styles.loadingOverlay}>
          {isLoading ? (
            <span className={styles.spinner}>◌</span>
          ) : (
            <span className={styles.hint}>Trình duyệt đang tải...</span>
          )}
        </div>
      </div>
    </div>
  );
}
