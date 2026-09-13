import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore.js';

/**
 * Global keyboard shortcuts for development and accessibility.
 * 
 * Shortcuts:
 * - F12: Toggle debug overlay
 * - Ctrl+Shift+D: Toggle debug overlay (alternative)
 * - Escape: Close active window (future)
 */
export function KeyboardShortcuts(): null {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // F12 or Ctrl+Shift+D: Toggle debug overlay
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'D')) {
        e.preventDefault();
        const store = useSettingsStore.getState();
        const current = store.tracking.showDebug;
        void store.update({
          tracking: { ...store.tracking, showDebug: !current }
        });
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return null;
}
