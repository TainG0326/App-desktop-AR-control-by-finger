import { describe, it, expect, beforeEach } from 'vitest';
import { InputRouter } from '../src/renderer/src/interaction/InputRouter';
import { pointerRef } from '../src/renderer/src/stores/pointerStore';

describe('InputRouter', () => {
  let router: InputRouter;

  beforeEach(() => {
    router = new InputRouter();
    pointerRef.visible = true;
    pointerRef.position = { x: 0, y: 0 };
  });

  describe('determineOwner', () => {
    it('returns NONE when pointer is not visible', () => {
      pointerRef.visible = false;
      const owner = router.determineOwner();
      expect(owner.type).toBe('NONE');
    });

    it('returns DESKTOP_UI when over dock', () => {
      router.updateDockBounds({ x: 0, y: 900, width: 1920, height: 80 });
      pointerRef.position = { x: 500, y: 950 };
      
      const owner = router.determineOwner();
      expect(owner.type).toBe('DESKTOP_UI');
    });

    it('returns WINDOW_CHROME when over title bar', () => {
      router.updateWindowHitZones([
        {
          windowId: 'win-1',
          titleBar: { x: 100, y: 100, width: 800, height: 40 },
          resizeHandle: { x: 880, y: 680, width: 20, height: 20 },
          contentArea: { x: 100, y: 140, width: 800, height: 560 },
          hasNativeContent: false
        }
      ]);
      pointerRef.position = { x: 300, y: 120 };
      
      const owner = router.determineOwner();
      expect(owner.type).toBe('WINDOW_CHROME');
      expect(owner.windowId).toBe('win-1');
    });

    it('returns WINDOW_RESIZE when over resize handle', () => {
      router.updateWindowHitZones([
        {
          windowId: 'win-1',
          titleBar: { x: 100, y: 100, width: 800, height: 40 },
          resizeHandle: { x: 880, y: 680, width: 20, height: 20 },
          contentArea: { x: 100, y: 140, width: 800, height: 560 },
          hasNativeContent: false
        }
      ]);
      pointerRef.position = { x: 890, y: 690 };
      
      const owner = router.determineOwner();
      expect(owner.type).toBe('WINDOW_RESIZE');
      expect(owner.windowId).toBe('win-1');
    });

    it('returns NATIVE_WEB_CONTENT when over YouTube content', () => {
      router.updateWindowHitZones([
        {
          windowId: 'youtube-1',
          titleBar: { x: 100, y: 100, width: 800, height: 40 },
          resizeHandle: { x: 880, y: 680, width: 20, height: 20 },
          contentArea: { x: 100, y: 140, width: 800, height: 560 },
          hasNativeContent: true
        }
      ]);
      pointerRef.position = { x: 400, y: 400 };
      
      const owner = router.determineOwner();
      expect(owner.type).toBe('NATIVE_WEB_CONTENT');
      expect(owner.windowId).toBe('youtube-1');
      expect(owner.localCoords).toEqual({ x: 300, y: 260 });
    });

    it('returns WINDOW_CONTENT when over React window content', () => {
      router.updateWindowHitZones([
        {
          windowId: 'notes-1',
          titleBar: { x: 100, y: 100, width: 600, height: 40 },
          resizeHandle: { x: 680, y: 680, width: 20, height: 20 },
          contentArea: { x: 100, y: 140, width: 600, height: 560 },
          hasNativeContent: false
        }
      ]);
      pointerRef.position = { x: 300, y: 300 };
      
      const owner = router.determineOwner();
      expect(owner.type).toBe('WINDOW_CONTENT');
      expect(owner.windowId).toBe('notes-1');
    });

    it('respects z-order (front to back)', () => {
      router.updateWindowHitZones([
        {
          windowId: 'win-back',
          titleBar: { x: 50, y: 50, width: 800, height: 40 },
          resizeHandle: { x: 830, y: 630, width: 20, height: 20 },
          contentArea: { x: 50, y: 90, width: 800, height: 560 },
          hasNativeContent: false
        },
        {
          windowId: 'win-front',
          titleBar: { x: 200, y: 200, width: 600, height: 40 },
          resizeHandle: { x: 780, y: 680, width: 20, height: 20 },
          contentArea: { x: 200, y: 240, width: 600, height: 460 },
          hasNativeContent: false
        }
      ]);
      
      // Point in overlapping area
      pointerRef.position = { x: 400, y: 400 };
      
      const owner = router.determineOwner();
      expect(owner.windowId).toBe('win-front'); // Front window wins
    });
  });
});
