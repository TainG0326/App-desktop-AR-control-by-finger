/**
 * World routing for AirScience.
 *
 * Centralizes which screen the user is currently on. A single store is
 * enough — AirScience doesn't have nested routes.
 *
 * Screens:
 *  - 'home'        : AirScience home with 3 world portals.
 *  - 'space'       : Space World (missions + explore).
 *  - 'animals'     : placeholder (phase 6).
 *  - 'human-body'  : placeholder (phase 7).
 *
 * Mode applies only when inside a world:
 *  - 'mission' : MissionRunner active.
 *  - 'explore' : free-form exploration.
 */

import { create } from 'zustand';
import { Home } from './Home/Home.js';
import { WORLDS } from './worlds/registry.js';
// Side-effect import: registers all Space missions into missionEngine.
import './worlds/space/missions/index.js';

export type AirScienceScreen = 'home' | 'space';
export type AirScienceMode = 'mission' | 'explore';

interface WorldBridgeState {
  screen: AirScienceScreen;
  mode: AirScienceMode;
  activeMissionId: string | null;
  goHome: () => void;
  openWorld: (screen: AirScienceScreen) => void;
  setMode: (mode: AirScienceMode) => void;
  setActiveMission: (id: string | null) => void;
}

export const useWorldBridge = create<WorldBridgeState>((set) => ({
  screen: 'home',
  mode: 'explore',
  activeMissionId: null,

  goHome: () =>
    set({ screen: 'home', mode: 'explore', activeMissionId: null }),

  openWorld: (screen) =>
    set({ screen, mode: 'explore', activeMissionId: null }),

  setMode: (mode) =>
    set((state) => ({
      mode,
      activeMissionId: mode === 'explore' ? null : state.activeMissionId
    })),

  setActiveMission: (id) => set({ activeMissionId: id })
}));

/**
 * WorldBridge — top-level routing between Home and the active world.
 *
 * Home is always mounted but renders null when screen !== 'home'. That
 * way the camera + SpatialCursor are never re-mounted when navigating
 * between screens, preserving MediaPipe state.
 */
export function WorldBridge(): JSX.Element {
  const screen = useWorldBridge((s) => s.screen);

  return (
    <>
      <Home />
      {screen !== 'home' && (() => {
        const world = WORLDS.find((w) => w.id === screen);
        return world ? (world.renderer as () => JSX.Element)() : null;
      })()}
    </>
  );
}
