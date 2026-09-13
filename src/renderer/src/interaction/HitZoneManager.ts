/**
 * HitZoneManager keeps the InputRouter's hit zones in sync with the live
 * window layout.
 *
 * Architecture:
 *   useWindowStore ──subscribe──> HitZoneManager ──updateWindowHitZones──> InputRouter
 *   Dock DOM ref  ──useEffect──> HitZoneManager ──updateDockBounds──────> InputRouter
 *
 * The InputRouter needs to know:
 *   - titleBar rect    (for window drag)
 *   - resizeHandle rect (for window resize)
 *   - contentArea rect  (for routing gesture events)
 *   - hasNativeContent (for routing to WebContentInputDispatcher vs InteractionDispatcher)
 *
 * For native content windows (Browser, YouTube):
 *   - The React WindowChrome title bar is 38px.
 *   - BrowserAppNative adds a URL bar of 38px.
 *   - So contentArea.y = window.y + 38 (titleBar) + 38 (URL bar) + 2 (border)
 *   - contentArea matches the WebContentsView bounds in the native layer.
 */
import { getInputRouter, type WindowHitZones } from './InputRouter.js';
import { useWindowStore } from '../stores/windowsStore.js';
import type { WindowDescriptor } from '@shared/types/index.js';
import type { Rectangle } from '../utils/coordinateMapper.js';

const TITLE_BAR_HEIGHT = 38;
const URL_BAR_HEIGHT = 38; // only for Browser app
const RESIZE_HANDLE_SIZE = 18;
const FRAME_BORDER = 2;

function computeHitZones(
  windows: Record<string, WindowDescriptor>,
  order: string[]
): WindowHitZones[] {
  return order
    .map((id) => {
      const w = windows[id];
      if (!w) return null;

      const titleBar: Rectangle = {
        x: w.x,
        y: w.y,
        width: w.width,
        height: TITLE_BAR_HEIGHT
      };

      const resizeHandle: Rectangle = {
        x: w.x + w.width - RESIZE_HANDLE_SIZE,
        y: w.y + w.height - RESIZE_HANDLE_SIZE,
        width: RESIZE_HANDLE_SIZE,
        height: RESIZE_HANDLE_SIZE
      };

      // contentArea: below title bar, above resize handle
      // For Browser, we also subtract the URL bar height
      const urlBarExtra = w.appType === 'browser' ? URL_BAR_HEIGHT : 0;

      const contentArea: Rectangle = {
        x: w.x + FRAME_BORDER,
        y: w.y + TITLE_BAR_HEIGHT + urlBarExtra + FRAME_BORDER,
        width: Math.max(1, w.width - FRAME_BORDER * 2),
        height: Math.max(
          1,
          w.height - TITLE_BAR_HEIGHT - urlBarExtra - FRAME_BORDER * 2
        )
      };

      return {
        windowId: id,
        titleBar,
        resizeHandle,
        contentArea,
        hasNativeContent: w.hasNativeContent
      };
    })
    .filter((z): z is WindowHitZones => z !== null);
}

class HitZoneManager {
  private unsubscribe: (() => void) | null = null;

  start(): void {
    if (this.unsubscribe) return;

    const router = getInputRouter();

    // Initial sync.
    const { windows, order } = useWindowStore.getState();
    router.updateWindowHitZones(computeHitZones(windows, order));

    // Subscribe to future changes.
    this.unsubscribe = useWindowStore.subscribe(
      (s) => ({ windows: s.windows, order: s.order }),
      ({ windows, order }) => {
        router.updateWindowHitZones(computeHitZones(windows, order));
      }
    );

    console.log('[HitZoneManager] started — synced initial window hit zones');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    console.log('[HitZoneManager] stopped');
  }

  /**
   * Update dock bounds. Call this from the Dock component on mount and
   * whenever the dock geometry changes.
   */
  updateDockBounds(bounds: Rectangle): void {
    getInputRouter().updateDockBounds(bounds);
  }
}

let instance: HitZoneManager | null = null;

export function getHitZoneManager(): HitZoneManager {
  if (!instance) {
    instance = new HitZoneManager();
  }
  return instance;
}
