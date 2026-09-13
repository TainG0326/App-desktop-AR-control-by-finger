/**
 * AirScience — Progress Store.
 *
 * Persists to localStorage under STORAGE_KEY. In-memory reads are
 * synchronous via zustand.
 *
 * Tracks:
 *  - total XP
 *  - per-mission: stars, attempts, completed, completedAt
 *  - per-world discoveries (set of object ids)
 *  - activeWorld (last screen the user was on)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MissionProgress, WorldId } from '../types.js';

interface ProgressState {
  xp: number;
  missions: Record<string, MissionProgress>;
  discoveries: Record<WorldId, string[]>;
  /** Last world visited. Used for "resume" UX (phase 2+). */
  lastWorld: WorldId | null;

  /** Record a mission completion. Awards XP and stars. */
  completeMission: (missionId: string, stars: number, worldId: WorldId) => void;

  /** Manually grant XP (e.g. from a discovery). */
  grantXp: (amount: number) => void;

  /** Mark an object as discovered (idempotent). Awards XP only on first discovery. */
  discoverObject: (worldId: WorldId, objectId: string, xpReward: number) => void;

  /** Total stars earned across all missions. */
  totalStars: () => number;

  /** Total discoveries across all worlds. */
  totalDiscoveries: () => number;

  /** Reset all progress. Used by parent settings. */
  reset: () => void;
}

const STORAGE_KEY = 'airscience-progress-v1';

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      xp: 0,
      missions: {},
      discoveries: {
        space: []
      },
      lastWorld: null,

      completeMission: (missionId, stars, worldId) =>
        set((state) => {
          const existing = state.missions[missionId];
          const isFirstCompletion = !existing?.completed;
          const newAttempts = (existing?.attempts ?? 0) + 1;
          const bestStars = Math.max(existing?.stars ?? 0, stars);

          // XP: full reward on first completion, half on retries.
          const xpDelta = isFirstCompletion
            ? 50 + stars * 25
            : stars > (existing?.stars ?? 0)
              ? (stars - (existing?.stars ?? 0)) * 25
              : 0;

          return {
            xp: state.xp + xpDelta,
            missions: {
              ...state.missions,
              [missionId]: {
                missionId,
                stars: bestStars,
                attempts: newAttempts,
                completed: true,
                completedAt: existing?.completedAt ?? new Date().toISOString()
              }
            },
            lastWorld: worldId
          };
        }),

      grantXp: (amount) => set((state) => ({ xp: state.xp + amount })),

      discoverObject: (worldId, objectId, xpReward) =>
        set((state) => {
          const already = state.discoveries[worldId].includes(objectId);
          if (already) return state;
          return {
            xp: state.xp + xpReward,
            discoveries: {
              ...state.discoveries,
              [worldId]: [...state.discoveries[worldId], objectId]
            }
          };
        }),

      totalStars: () => {
        const missions = get().missions;
        return Object.values(missions).reduce((sum, m) => sum + m.stars, 0);
      },

      totalDiscoveries: () => {
        const disc = (get().discoveries ?? {}) as Record<string, string[] | undefined>;
        const spaceCount = disc.space?.length ?? 0;
        return spaceCount;
      },

      reset: () =>
        set({
          xp: 0,
          missions: {},
          discoveries: { space: [] },
          lastWorld: null
        })
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // Migrate old persisted schema to current schema
      migrate: (persistedState: any, version: number) => {
        if (!persistedState) return persistedState;
        if (version < 3) {
          // Keep only space discoveries; remove old worlds (animals, human-body, detective)
          const oldDisc = persistedState.discoveries ?? {};
          persistedState.discoveries = {
            space: oldDisc.space ?? []
          };
        }
        return persistedState;
      }
    }
  )
);
