import { useSyncExternalStore } from 'react';
import { CameraService } from './CameraService.js';
import type { CameraState } from './types.js';

/**
 * Singleton service instance for the renderer.
 * Created lazily so SSR / tests can import the module without side effects.
 */
let _service: CameraService | null = null;
export function getCameraService(): CameraService {
  if (!_service) _service = new CameraService();
  return _service;
}

/**
 * React binding via useSyncExternalStore.
 * Components can select a slice of state to avoid re-renders on unrelated changes.
 */
export function useCamera<T = CameraState>(selector: (s: CameraState) => T = (s) => s as unknown as T): T {
  const service = getCameraService();
  return useSyncExternalStore(
    service.subscribe.bind(service),
    () => selector(service.getState()),
    () => selector(service.getState())
  );
}