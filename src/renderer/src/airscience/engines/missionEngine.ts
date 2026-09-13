/**
 * AirScience — Mission Engine.
 *
 * Pure-TS loader + validator. No React, no DOM. Adding a mission is a
 * data operation: write a Mission descriptor and register it in the
 * world registry.
 *
 * The engine owns three things:
 *  - Mission lookup by id.
 *  - Placement validation (does the child's placements match success?).
 *  - Completion event shape (for ProgressStore to consume).
 */

import type { Mission, PlaceableObject } from '../types.js';

export interface Placement {
  objectId: string;
  slotId: string;
}

export interface CompletionResult {
  success: boolean;
  /** Set of objectIds that are correctly placed when the user attempts. */
  correctObjects: string[];
  /** Object ids the child still needs to place. */
  remaining: string[];
}

export class MissionEngine {
  private missions = new Map<string, Mission>();

  register(mission: Mission): void {
    this.missions.set(mission.id, mission);
  }

  load(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  list(): Mission[] {
    return Array.from(this.missions.values());
  }

  /**
   * Validate a set of placements against a mission. A mission is complete
   * when every placeable object has been dropped onto its correct slot.
   */
  validate(mission: Mission, placements: Placement[]): CompletionResult {
    const placed = new Map<string, string>();
    for (const p of placements) {
      placed.set(p.objectId, p.slotId);
    }

    const correctObjects: string[] = [];
    const remaining: string[] = [];
    let allCorrect = true;

    for (const obj of mission.objects) {
      const placedSlot = placed.get(obj.id);
      if (placedSlot === obj.correctSlotId) {
        correctObjects.push(obj.id);
      } else {
        allCorrect = false;
        remaining.push(obj.id);
      }
    }

    return {
      success: allCorrect,
      correctObjects,
      remaining
    };
  }
}

/** Single shared instance — missions are static for a given build. */
export const missionEngine = new MissionEngine();

export type { Mission, PlaceableObject };
