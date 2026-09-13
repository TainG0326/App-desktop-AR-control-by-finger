/**
 * Converts between global viewport coordinates and local WebContentsView coordinates.
 * 
 * Used by InputRouter to translate spatial pointer position into
 * coordinates relative to native web content.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CoordinateMapper {
  /**
   * Convert global viewport coordinates to local WebContentsView coordinates.
   * 
   * @param global - Global viewport position (e.g., from pointerRef)
   * @param viewBounds - WebContentsView bounds relative to viewport
   * @returns Local coordinates within the view, or null if outside bounds
   */
  toLocal(global: Point, viewBounds: Rectangle): Point | null {
    const localX = global.x - viewBounds.x;
    const localY = global.y - viewBounds.y;

    // Check if point is within bounds
    if (
      localX < 0 ||
      localY < 0 ||
      localX >= viewBounds.width ||
      localY >= viewBounds.height
    ) {
      return null;
    }

    return { x: localX, y: localY };
  }

  /**
   * Check if a global point is within a rectangle.
   */
  isInside(point: Point, rect: Rectangle): boolean {
    return (
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height
    );
  }

  /**
   * Calculate content bounds from window bounds by subtracting chrome.
   * 
   * @param windowBounds - Full window rectangle
   * @param titleBarHeight - Height of title bar in pixels
   * @param borders - Border thickness { left, right, top, bottom }
   */
  calculateContentBounds(
    windowBounds: Rectangle,
    titleBarHeight: number,
    borders: { left: number; right: number; top: number; bottom: number }
  ): Rectangle {
    return {
      x: windowBounds.x + borders.left,
      y: windowBounds.y + titleBarHeight + borders.top,
      width: windowBounds.width - borders.left - borders.right,
      height: windowBounds.height - titleBarHeight - borders.top - borders.bottom
    };
  }
}

// Singleton instance
let instance: CoordinateMapper | null = null;

export function getCoordinateMapper(): CoordinateMapper {
  if (!instance) {
    instance = new CoordinateMapper();
  }
  return instance;
}
