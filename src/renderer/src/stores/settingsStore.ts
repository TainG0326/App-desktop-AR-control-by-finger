import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Settings } from '@shared/types/index.js';

interface SettingsStore extends Settings {
  hydrated: boolean;
  hydrate(): Promise<void>;
  update(patch: Partial<Settings>): Promise<void>;
  resetAll(): Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector((set) => ({
    hydrated: false,

    camera: { deviceId: null, mirror: true, autoStart: true },
    tracking: {
      enabled: true,
      smoothing: 0.5,
      pinchSensitivity: 0.5,
      cursorSensitivity: 0.5,
      showDebug: false,
      mouseFallback: false,
      dwellMs: 800,
      dwellJitterPx: 4,
      dragPx: 6,
      holdDragMs: 3000,
      holdDragSensitivityPx: 4,
      zoomMin: 0.5,
      zoomMax: 2.5,
      pinchZoomEnabled: true,
      twoHandGestures: false
    },
    appearance: { uiScale: 1.0, transparency: 0.55, blur: 18, animation: 1.0 },
    accessibility: { reducedMotion: false, highContrast: false },
    calibration: null,
    onboardingComplete: false,

    async hydrate() {
      const fresh = await window.api.settings.get();
      set({ ...fresh, hydrated: true });
    },

    async update(patch) {
      const next = await window.api.settings.set(patch);
      set({ ...next });
    },

    async resetAll() {
      const fresh = await window.api.settings.reset();
      set({ ...fresh });
    }
  }))
);