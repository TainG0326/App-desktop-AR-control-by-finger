import { pointerRef } from '../stores/pointerStore.js';
import { getCoordinateMapper } from '../utils/coordinateMapper.js';
import type { Point, Rectangle } from '../utils/coordinateMapper.js';

export type InputOwnerType =
  | 'NONE'
  | 'DESKTOP_UI'
  | 'WINDOW_CHROME'
  | 'WINDOW_RESIZE'
  | 'WINDOW_CONTENT'
  | 'NATIVE_WEB_CONTENT';

export interface InputOwner {
  type: InputOwnerType;
  windowId?: string;
  element?: Element;
  localCoords?: Point;
}

export interface WindowHitZones {
  windowId: string;
  titleBar: Rectangle;
  resizeHandle: Rectangle;
  contentArea: Rectangle;
  hasNativeContent: boolean;
}

/**
 * InputRouter determines which subsystem should receive gesture events
 * based on spatial pointer position and window layout.
 * 
 * Priority order:
 * 1. Window title bar (drag)
 * 2. Window resize handle
 * 3. Dock
 * 4. Native web content (YouTube WebContentsView)
 * 5. React window content (Notes, Drawing)
 * 6. Desktop background
 */
export class InputRouter {
  private windowHitZones: WindowHitZones[] = [];
  private dockBounds: Rectangle | null = null;
  private mapper = getCoordinateMapper();

  /**
   * Update hit zones from current window layout.
   * Call this whenever windows move, resize, or z-order changes.
   */
  updateWindowHitZones(zones: WindowHitZones[]): void {
    // Sort by z-index (back to front already assumed from order)
    this.windowHitZones = [...zones];
  }

  updateDockBounds(bounds: Rectangle): void {
    this.dockBounds = bounds;
  }

  /**
   * Determine which subsystem owns the gesture at current pointer position.
   * Returns the topmost hit in z-order.
   */
  determineOwner(): InputOwner {
    const pos = pointerRef.position;

    if (!pointerRef.visible) {
      return { type: 'NONE' };
    }

    // Check dock first (always on top)
    if (this.dockBounds && this.mapper.isInside(pos, this.dockBounds)) {
      return { type: 'DESKTOP_UI' };
    }

    // Check windows from front to back (reverse order)
    for (let i = this.windowHitZones.length - 1; i >= 0; i--) {
      const zone = this.windowHitZones[i];

      // Title bar
      if (this.mapper.isInside(pos, zone.titleBar)) {
        return {
          type: 'WINDOW_CHROME',
          windowId: zone.windowId
        };
      }

      // Resize handle
      if (this.mapper.isInside(pos, zone.resizeHandle)) {
        return {
          type: 'WINDOW_RESIZE',
          windowId: zone.windowId
        };
      }

      // Content area
      if (this.mapper.isInside(pos, zone.contentArea)) {
        if (zone.hasNativeContent) {
          const localCoords = this.mapper.toLocal(pos, zone.contentArea);
          return {
            type: 'NATIVE_WEB_CONTENT',
            windowId: zone.windowId,
            localCoords: localCoords ?? undefined
          };
        } else {
          return {
            type: 'WINDOW_CONTENT',
            windowId: zone.windowId
          };
        }
      }
    }

    // Default: desktop background
    return { type: 'DESKTOP_UI' };
  }

  /**
   * Check if pointer is currently over a specific owner type.
   */
  isOverType(type: InputOwnerType): boolean {
    return this.determineOwner().type === type;
  }

  /**
   * Get owner for a specific point (useful for testing).
   */
  determineOwnerAt(point: Point): InputOwner {
    const original = { ...pointerRef.position };
    const wasVisible = pointerRef.visible;
    
    pointerRef.position = point;
    pointerRef.visible = true;
    
    const owner = this.determineOwner();
    
    pointerRef.position = original;
    pointerRef.visible = wasVisible;
    
    return owner;
  }
}

// Singleton instance
let instance: InputRouter | null = null;

export function getInputRouter(): InputRouter {
  if (!instance) {
    instance = new InputRouter();
  }
  return instance;
}
