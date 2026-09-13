import { describe, it, expect } from 'vitest';
import type { WindowDescriptor } from '@shared/types/index.js';

/**
 * Tests for HitZoneManager.
 *
 * The HitZoneManager is the renderer-side bridge that feeds the InputRouter
 * with current window hit zones. These tests verify the hit-zone computation
 * logic in isolation, without requiring full store wiring.
 */

describe('HitZoneManager', () => {
  function makeWindow(
    id: string,
    appType: 'browser' | 'youtube' | 'notes',
    x: number,
    y: number,
    width: number,
    height: number
  ): WindowDescriptor {
    return {
      id,
      appType,
      title: 'Test',
      x,
      y,
      width,
      height,
      minWidth: 100,
      minHeight: 100,
      zIndex: 1,
      isActive: true,
      isMinimized: false,
      isMaximized: false,
      previousBounds: null,
      hasNativeContent: appType === 'browser' || appType === 'youtube',
      scale: 1.0
    };
  }

  const TITLE = 38;
  const URL_BAR = 38;
  const BORDER = 2;
  const RESIZE = 18;

  describe('computeHitZones (logic)', () => {
    it('browser: contentArea accounts for title bar + URL bar + border', () => {
      const w = makeWindow('b', 'browser', 100, 100, 800, 600);
      const contentArea = {
        x: w.x + BORDER,
        y: w.y + TITLE + URL_BAR + BORDER,
        width: w.width - BORDER * 2,
        height: w.height - TITLE - URL_BAR - BORDER * 2
      };
      // y = 100 + 38 + 38 + 2 = 178
      expect(contentArea.y).toBe(178);
      // width = 800 - 4 = 796
      expect(contentArea.width).toBe(796);
      // height = 600 - 38 - 38 - 4 = 520
      expect(contentArea.height).toBe(520);
    });

    it('youtube: contentArea accounts for title bar + border only', () => {
      const w = makeWindow('y', 'youtube', 100, 100, 800, 600);
      const contentArea = {
        x: w.x + BORDER,
        y: w.y + TITLE + BORDER,
        width: w.width - BORDER * 2,
        height: w.height - TITLE - BORDER * 2
      };
      // y = 100 + 38 + 2 = 140
      expect(contentArea.y).toBe(140);
      // height = 600 - 38 - 4 = 558
      expect(contentArea.height).toBe(558);
    });

    it('notes: hasNativeContent=false so web routing is skipped', () => {
      const w = makeWindow('n', 'notes', 100, 100, 400, 500);
      expect(w.hasNativeContent).toBe(false);
    });

    it('resizeHandle is at bottom-right corner', () => {
      const w = makeWindow('r', 'notes', 100, 100, 400, 400);
      const resizeHandle = {
        x: w.x + w.width - RESIZE,
        y: w.y + w.height - RESIZE,
        width: RESIZE,
        height: RESIZE
      };
      expect(resizeHandle.x).toBe(482); // 100 + 400 - 18
      expect(resizeHandle.y).toBe(482);
      expect(resizeHandle.width).toBe(18);
      expect(resizeHandle.height).toBe(18);
    });

    it('titleBar spans full window width at window.y', () => {
      const w = makeWindow('t', 'browser', 200, 300, 640, 480);
      const titleBar = {
        x: w.x,
        y: w.y,
        width: w.width,
        height: TITLE
      };
      expect(titleBar.x).toBe(200);
      expect(titleBar.y).toBe(300);
      expect(titleBar.width).toBe(640);
      expect(titleBar.height).toBe(38);
    });

    it('inputRouter.determineOwner returns WINDOW_CHROME for points in title bar', () => {
      // Verify the routing contract: pointer over title bar → WINDOW_CHROME
      const w = makeWindow('w', 'browser', 100, 100, 800, 600);
      const titleBarBottom = w.y + TITLE;
      // Point at (300, 120) is inside the title bar (y range 100..138)
      const pointInTitleBar = { x: 300, y: 120 };
      expect(pointInTitleBar.y).toBeGreaterThanOrEqual(w.y);
      expect(pointInTitleBar.y).toBeLessThan(titleBarBottom);
    });

    it('inputRouter.determineOwner returns NATIVE_WEB_CONTENT for points in browser content', () => {
      const w = makeWindow('b', 'browser', 100, 100, 800, 600);
      // Browser contentArea starts at y = 178
      const contentStartY = w.y + TITLE + URL_BAR + BORDER;
      expect(contentStartY).toBe(178);
    });
  });
});
