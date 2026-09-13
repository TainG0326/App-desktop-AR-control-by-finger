/**
 * AirScience — shared domain types.
 *
 * Kept separate from React so engines stay framework-agnostic and easy
 * to unit-test.
 */

/** Worlds AirScience currently supports. Adding a world = adding a literal. */
export type WorldId = 'space';

/** Discovery metadata for a single science object. */
export interface ScienceObjectRef {
  /** Globally unique id within the world. e.g. 'space.earth'. */
  id: string;
  /** Short Vietnamese label for the child. */
  labelVi: string;
  /** English subtitle. */
  labelEn: string;
  /** Optional emoji/icon used in lists. */
  glyph: string;
}

/** Progress persisted for a single mission. */
export interface MissionProgress {
  missionId: string;
  /** Highest star count achieved. 0–3. */
  stars: number;
  /** Times the child has completed the mission. */
  attempts: number;
  /** True if the child finished it at least once. */
  completed: boolean;
  /** ISO timestamp of last completion, or null. */
  completedAt: string | null;
}

/** Discovery record for one science object. */
export interface Discovery {
  objectId: string;
  worldId: WorldId;
  discoveredAt: string;
}

/** The mode a world is currently rendering. */
export type WorldMode = 'mission' | 'explore';

/** Geometry for a single drop slot used by drag-and-place missions. */
export interface DropSlot {
  id: string;
  /** Center x in world-container coordinates (0..1 normalized). */
  x: number;
  /** Center y in world-container coordinates (0..1 normalized). */
  y: number;
  /** Optional radius hint (0..1). */
  radius?: number;
}

/** Geometry + behavior for a placeable object inside a mission scene. */
export interface PlaceableObject {
  id: string;
  labelVi: string;
  glyph: string;
  /** Color or CSS color string used for visual rendering. */
  color: string;
  /** Initial position in normalized world-container coords. */
  initialPosition: { x: number; y: number };
  /** Drop slot this object belongs to when correct. */
  correctSlotId: string;
}

/** Mission data shape. Renderers consume this; they do NOT hardcode logic. */
export interface Mission {
  id: string;
  worldId: WorldId;
  title: string;
  description: string;
  ageRange: [number, number];
  difficulty: 'easy' | 'medium' | 'hard';
  /** Up to 3 short instructions. Each shown sequentially. */
  instructions: string[];
  /** Drop slots available in this mission. */
  slots: DropSlot[];
  /** Objects the child must place. */
  objects: PlaceableObject[];
  /** Fact id surfaced after success. */
  factIdOnSuccess: string;
  /** Free-text encouragement shown when a wrong slot is hit. */
  wrongHint: string;
  /** XP granted on first completion. */
  xpReward: number;
}

/** A single science fact. See AIRSCIENCE_CONTENT_MODEL.md. */
export interface ScienceFact {
  id: string;
  world: WorldId;
  topic: string;
  objectId: string;
  titleVi: string;
  titleEn: string;
  shortExplanationVi: string;
  extendedExplanationVi: string;
  ageRange: '7-8' | '8-10' | '9-10';
  difficulty: 'easy' | 'medium' | 'hard';
  source: string;
  sourceUrl: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewStatus: 'draft' | 'reviewed' | 'published';
  xpReward: number;
}
