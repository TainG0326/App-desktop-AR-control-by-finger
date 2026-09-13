import { useEffect, useRef } from 'react';
import { useWindowStore } from '@renderer/stores/windowsStore.js';
import { getWebContentInputDispatcher } from '@renderer/interaction/WebContentInputDispatcher.js';
import type { Rectangle } from '@renderer/types/api.d.js';

interface YouTubeNativeProps {
  windowId: string;
}

/**
 * YouTubeAppNative — Manages a native Electron WebContentsView
 * that loads the real YouTube website.
 *
 * Lifecycle is split into three effects:
 *  1. Create on mount, destroy on unmount (depends on windowId alone)
 *  2. Sync bounds when window moves/resizes (depends on geometry only)
 *  3. Toggle visibility on minimize (depends on isMinimized only)
 *
 * Bundling create/destroy into the same effect as the bounds sync caused a
 * churn loop where every position update destroyed the view and rebuilt it.
 */
export function YouTubeAppNative({ windowId }: YouTubeNativeProps): JSX.Element {
  const win = useWindowStore((s) => s.windows[windowId]);
  const viewCreatedRef = useRef(false);

  // 1) Mount/unmount lifecycle — runs once per windowId
  useEffect(() => {
    // Reserve synchronously to prevent race conditions with StrictMode
    // double-invoke and rapid re-renders.
    viewCreatedRef.current = true;

    const createView = async (): Promise<void> => {
      // Use current store state, not stale closure
      const initial = useWindowStore.getState().windows[windowId];
      if (!initial) {
        viewCreatedRef.current = false;
        return;
      }

      try {
        const titleBarHeight = 38;
        const borders = { left: 2, right: 2, top: 2, bottom: 2 };

        // Send window bounds + the standard 0 extra offset; the WebContentManager
        // re-derives the actual WebContentsView rect and subtracts the title bar
        // + frame border so the view never covers the React chrome.
        await window.api?.webview.create(
          windowId,
          'youtube',
          {
            x: initial.x,
            y: initial.y,
            width: initial.width,
            height: initial.height
          },
          0
        );

        // HitZoneManager computes contentArea from windowStore:
        // y = window.y + 38(title bar) + 2(border)
        // Must match so InputRouter localCoords = WebContentInputDispatcher localCoords.
        const contentBounds: Rectangle = {
          x: Math.floor(initial.x + borders.left),
          y: Math.floor(initial.y + titleBarHeight + borders.top),
          width: Math.floor(initial.width - borders.left - borders.right),
          height: Math.floor(initial.height - titleBarHeight - borders.top - borders.bottom)
        };
        getWebContentInputDispatcher().updateContentBounds(windowId, contentBounds);
        console.log(`[YouTubeNative] ✓ Created WebContentsView for ${windowId}`);
      } catch (err) {
        console.error('[YouTubeNative] ✗ Failed to create view:', err);
        viewCreatedRef.current = false;
      }
    };

    void createView();

    // Cleanup only on actual unmount (windowId change or component death)
    return () => {
      console.log(`[YouTubeNative] Destroying WebContentsView for ${windowId}`);
      void window.api?.webview.destroy(windowId);
      viewCreatedRef.current = false;
    };
  }, [windowId]);

  // 2) Sync bounds on geometry change — does NOT recreate the view
  useEffect(() => {
    if (!win) return;
    const titleBarHeight = 38;
    const borders = { left: 2, right: 2, top: 2, bottom: 2 };

    // Send window bounds to the manager; it subtracts the chrome itself.
    void window.api?.webview.updateBounds(windowId, {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height
    });

    const contentBounds: Rectangle = {
      x: Math.floor(win.x + borders.left),
      y: Math.floor(win.y + titleBarHeight + borders.top),
      width: Math.floor(win.width - borders.left - borders.right),
      height: Math.floor(win.height - titleBarHeight - borders.top - borders.bottom)
    };
    getWebContentInputDispatcher().updateContentBounds(windowId, contentBounds);
  }, [windowId, win?.x, win?.y, win?.width, win?.height]);

  // 3) Visibility on minimize toggle
  useEffect(() => {
    if (!win) return;
    void window.api?.webview.setVisible(windowId, !win.isMinimized);
  }, [windowId, win?.isMinimized]);

  // Render empty placeholder — WebContentsView is native Electron layer
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0f0f0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: '14px',
        fontFamily: 'system-ui, sans-serif',
        userSelect: 'none',
        pointerEvents: 'none'
      }}
    >
      YouTube
    </div>
  );
}
