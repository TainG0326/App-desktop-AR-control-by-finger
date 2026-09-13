import { useEffect, useState } from 'react';
import { useSettingsStore } from '@renderer/stores/settingsStore.js';

export function SettingsHydrator(): null {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if window.api exists
    if (!window.api) {
      const msg = 'FATAL: window.api is undefined. Preload bridge failed to load.';
      console.error(msg);
      setError(msg);
      return;
    }

    hydrate().catch((err) => {
      const msg = `Settings hydration failed: ${err}`;
      console.error(msg, err);
      setError(msg);
    });
  }, [hydrate]);

  if (error) {
    console.error('[SettingsHydrator]', error);
  }

  return null;
}