import { useEffect } from 'react';
import { CameraLayer } from './camera/CameraLayer.js';
import { getCameraService, useCamera } from './camera/useCamera.js';
import { HandTrackingBridge } from './hand-tracking/HandTrackingBridge.js';
import { DebugOverlay } from './hand-tracking/DebugOverlay.js';
import { useTrackerState, useHandFrame } from './hand-tracking/useHandTracking.js';
import { getPointerController } from './interaction/PointerController.js';
import { SpatialCursor } from './components/SpatialCursor.js';
import { GestureBridge } from './components/GestureStatusPill.js';
import { ToastProvider } from './components/Toast.js';
import { GestureDebugIndicator } from './components/GestureDebugIndicator.js';
import { OnboardingOverlay } from './onboarding/OnboardingOverlay.js';
import { CinematicIntro } from './onboarding/CinematicIntro.js';
import { InteractionBridge } from './interaction/InteractionBridge.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { useToolStore } from './stores/toolStore.js';
import { WorldBridge } from './airscience/worldBridge.js';
import styles from './App.module.css';

function DevDebugLayer(): JSX.Element | null {
  const status = useTrackerState((s) => s.status);
  const frame = useHandFrame();
  const fps = useTrackerState((s) => s.fps);
  const inferenceMs = useTrackerState((s) => s.inferenceMs);
  const showDebug = useSettingsStore((s) => s.tracking.showDebug);
  if (!showDebug || status !== 'running' || !frame) return null;
  return <DebugOverlay visible frame={frame} fps={fps} inferenceMs={inferenceMs} />;
}

function PointerBridge(): null {
  const mirror = useCamera((s) => s.mirror);
  const smoothing = useSettingsStore((s) => s.tracking.smoothing);
  useEffect(() => {
    getPointerController({ mirror, calibration: null, smoothing, cursorSensitivity: 1.0 });
  }, [mirror, smoothing]);
  return null;
}

/** Listens for keyboard shortcuts. */
function ToolHotkeys(): null {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'Escape') {
        useToolStore.getState().setTool('none');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return null;
}

export function App(): JSX.Element {
  void getCameraService();

  return (
    <ToastProvider>
      <CinematicIntro durationMs={2400} />
      <div className={styles.shell}>
        <CameraLayer />
        <DevDebugLayer />
        <GestureDebugIndicator />
        <div className={styles.grid} aria-hidden />
        <SpatialCursor />

        {/*
         * AirScience replaces the old desktop chrome.
         * WorldBridge routes between Home and the active world based on
         * the worldBridge store (airscience/worldBridge.ts).
         * Camera + SpatialCursor + Gesture infra remain always-mounted
         * so MediaPipe state is preserved across screen transitions.
         */}
        <WorldBridge />

        <HandTrackingBridge />
        <PointerBridge />
        <GestureBridge />
        <InteractionBridge />
        <ToolHotkeys />
        <OnboardingOverlay />
      </div>
    </ToastProvider>
  );
}
