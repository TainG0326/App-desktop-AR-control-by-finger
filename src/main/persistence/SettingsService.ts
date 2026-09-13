import Store from 'electron-store';
import type { Settings } from '@shared/types/index.js';

const DEFAULTS: Settings = {
  camera: {
    deviceId: null,
    mirror: true,
    autoStart: true
  },
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
  appearance: {
    uiScale: 1.0,
    transparency: 0.55,
    blur: 18,
    animation: 1.0
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false
  },
  calibration: null,
  onboardingComplete: false
};

export class SettingsService {
  private store: Store<{ settings: Settings }>;

  constructor() {
    this.store = new Store<{ settings: Settings }>({
      name: 'settings',
      defaults: { settings: DEFAULTS },
      // electron-store debounces writes internally; we still bump safety.
      clearInvalidConfig: true
    });
  }

  get(): Settings {
    const raw = this.store.get('settings');
    return this.mergeWithDefaults(raw);
  }

  set(patch: Partial<Settings>): Settings {
    const current = this.get();
    const next = this.deepMerge(current, patch);
    this.store.set('settings', next);
    return next;
  }

  reset(): Settings {
    this.store.set('settings', DEFAULTS);
    return DEFAULTS;
  }

  private mergeWithDefaults(raw: unknown): Settings {
    if (!raw || typeof raw !== 'object') return DEFAULTS;
    return this.deepMerge(DEFAULTS, raw as Partial<Settings>);
  }

  private deepMerge<T>(base: T, patch: Partial<T>): T {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const key of Object.keys(patch as Record<string, unknown>)) {
      const a = (base as Record<string, unknown>)[key];
      const b = (patch as Record<string, unknown>)[key];
      if (
        a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)
      ) {
        out[key] = this.deepMerge(a, b);
      } else if (b !== undefined) {
        out[key] = b;
      }
    }
    return out as T;
  }
}
