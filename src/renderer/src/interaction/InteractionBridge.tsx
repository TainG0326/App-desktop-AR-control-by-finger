import { useEffect } from 'react';
import { getInteractionDispatcher } from './InteractionDispatcher.js';
import { getWebContentInputDispatcher } from './WebContentInputDispatcher.js';
import { getHitZoneManager } from './HitZoneManager.js';
import { useSettingsStore } from '../stores/settingsStore.js';

/**
 * Bridge component that starts the HitZoneManager and both dispatchers when mounted.
 * Must be mounted after GestureEngine is initialized.
 * Only active when tracking.enabled = true.
 */
export function InteractionBridge(): null {
  const trackingEnabled = useSettingsStore((s) => s.tracking.enabled);

  useEffect(() => {
    console.log('[InteractionBridge] mounted, trackingEnabled:', trackingEnabled);
    if (!trackingEnabled) {
      console.log('[InteractionBridge] tracking disabled, not starting dispatchers');
      return;
    }

    const dispatcher = getInteractionDispatcher();
    const webDispatcher = getWebContentInputDispatcher();
    const hitZoneManager = getHitZoneManager();
    console.log('[InteractionBridge] starting dispatchers');
    hitZoneManager.start();
    dispatcher.start();
    webDispatcher.start();
    console.log('[InteractionBridge] dispatchers started');
    return () => {
      dispatcher.stop();
      webDispatcher.stop();
      hitZoneManager.stop();
    };
  }, [trackingEnabled]);

  return null;
}