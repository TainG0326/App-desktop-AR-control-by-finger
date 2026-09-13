import { useCallback, useEffect, useRef } from 'react';
import { getCameraService, useCamera } from './useCamera.js';
import { useWorldBridge } from '@renderer/airscience/worldBridge.js';
import styles from './CameraLayer.module.css';
import { CameraErrorUI } from './CameraErrorUI.js';

/**
 * Fullscreen camera background.
 *
 * - Subscribes to the CameraService state.
 * - Attaches the active MediaStream to a hidden <video> element.
 * - Renders a non-blocking, non-interactive layer that sits behind the desktop UI.
 *
 * AirScience requires a working camera because the entire interaction model
 * is hand-gesture based. When the camera errors, CameraErrorUI blocks the
 * experience until the user fixes the underlying permission / hardware
 * issue and clicks Retry. There is no escape hatch.
 */
export function CameraLayer(): JSX.Element {
  const status = useCamera((s) => s.status);
  const stream = useCamera((s) => s.stream);
  const mirror = useCamera((s) => s.mirror);
  const error = useCamera((s) => s.error);
  const screen = useWorldBridge((s) => s.screen);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const service = getCameraService();

  // Hide camera when inside AirScience worlds (camera stays active for hand tracking)
  const isWorldMode = screen === 'space';

  // Auto-start once. We do NOT retry on every status change — that would
  // create a tight loop when permission is denied. The user clicks Retry
  // in CameraErrorUI after fixing the OS-level permission.
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (didAutoStart.current) return;
    if (status === 'idle' && service.isSupported()) {
      didAutoStart.current = true;
      void service.start({ mirror: true });
    }
  }, [status, service]);

  // Re-arm auto-start if the service falls back to idle after a cycle.
  useEffect(() => {
    if (status === 'idle' && didAutoStart.current) {
      didAutoStart.current = false;
    }
  }, [status]);

  // Bind the stream to the <video> element.
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        // play() can reject on autoplay restrictions; ignored.
      });
    }
  }, [stream]);

  const handleRetry = useCallback(() => {
    didAutoStart.current = false;
    service.stop();
    // small delay to ensure the previous stream is fully torn down before starting a new one
    setTimeout(() => {
      void service.start({ mirror });
    }, 100);
  }, [service, mirror]);

  const handleOpenSettings = useCallback(() => {
    // Camera permission is an OS-level setting — the user must grant
    // it manually. We don't expose a Settings window in AirScience.
  }, []);

  const showError =
    status === 'denied' ||
    status === 'unsupported' ||
    status === 'error' ||
    status === 'disconnected';

  return (
    <div className={styles.layer} aria-hidden={!showError}>
      {showError && error ? (
        <CameraErrorUI
          status={status}
          error={error}
          onRetry={handleRetry}
          onOpenSettings={handleOpenSettings}
        />
      ) : (
        <video
          ref={videoRef}
          className={`${styles.video} ${mirror ? styles.mirrored : ''} ${isWorldMode ? styles.worldHide : ''}`}
          autoPlay
          muted
          playsInline
          data-camera-feed
        />
      )}
      <div className={styles.scrim} />
    </div>
  );
}
