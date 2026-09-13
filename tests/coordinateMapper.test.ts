import { describe, it, expect } from 'vitest';
import { CoordinateMapper } from '../src/renderer/src/utils/coordinateMapper';

describe('CoordinateMapper', () => {
  const mapper = new CoordinateMapper();

  describe('toLocal', () => {
    it('converts global to local coordinates', () => {
      const global = { x: 500, y: 300 };
      const viewBounds = { x: 100, y: 80, width: 800, height: 600 };
      const local = mapper.toLocal(global, viewBounds);
      
      expect(local).toEqual({ x: 400, y: 220 });
    });

    it('returns null when point is outside bounds', () => {
      const global = { x: 50, y: 50 };
      const viewBounds = { x: 100, y: 100, width: 200, height: 200 };
      const local = mapper.toLocal(global, viewBounds);
      
      expect(local).toBeNull();
    });

    it('handles edge cases at boundaries', () => {
      const viewBounds = { x: 100, y: 100, width: 200, height: 200 };
      
      // Top-left corner (inside)
      expect(mapper.toLocal({ x: 100, y: 100 }, viewBounds)).toEqual({ x: 0, y: 0 });
      
      // Bottom-right corner (outside by 1px)
      expect(mapper.toLocal({ x: 300, y: 300 }, viewBounds)).toBeNull();
      
      // Just inside bottom-right
      expect(mapper.toLocal({ x: 299, y: 299 }, viewBounds)).toEqual({ x: 199, y: 199 });
    });
  });

  describe('isInside', () => {
    it('returns true when point is inside rectangle', () => {
      const point = { x: 150, y: 150 };
      const rect = { x: 100, y: 100, width: 200, height: 200 };
      
      expect(mapper.isInside(point, rect)).toBe(true);
    });

    it('returns false when point is outside rectangle', () => {
      const point = { x: 50, y: 50 };
      const rect = { x: 100, y: 100, width: 200, height: 200 };
      
      expect(mapper.isInside(point, rect)).toBe(false);
    });
  });

  describe('calculateContentBounds', () => {
    it('calculates content bounds from window bounds', () => {
      const windowBounds = { x: 100, y: 100, width: 800, height: 600 };
      const titleBarHeight = 40;
      const borders = { left: 2, right: 2, top: 2, bottom: 2 };
      
      const contentBounds = mapper.calculateContentBounds(windowBounds, titleBarHeight, borders);
      
      expect(contentBounds).toEqual({
        x: 102,       // 100 + 2
        y: 142,       // 100 + 40 + 2
        width: 796,   // 800 - 2 - 2
        height: 556   // 600 - 40 - 2 - 2
      });
    });

    it('handles zero borders', () => {
      const windowBounds = { x: 0, y: 0, width: 1000, height: 800 };
      const titleBarHeight = 32;
      const borders = { left: 0, right: 0, top: 0, bottom: 0 };
      
      const contentBounds = mapper.calculateContentBounds(windowBounds, titleBarHeight, borders);
      
      expect(contentBounds).toEqual({
        x: 0,
        y: 32,
        width: 1000,
        height: 768
      });
    });
  });
});
