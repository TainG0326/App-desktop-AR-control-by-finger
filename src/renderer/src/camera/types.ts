export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'denied'
  | 'unsupported'
  | 'error'
  | 'disconnected';

export interface CameraDevice {
  deviceId: string;
  label: string;
  /** 'user' (front) | 'environment' (back) | undefined when unknown */
  facing?: 'user' | 'environment' | undefined;
}

export interface CameraError {
  /** Stable code for programmatic handling */
  code: 'permission' | 'not-found' | 'in-use' | 'overconstrained' | 'aborted' | 'unknown';
  /** Human-readable message */
  message: string;
}

export interface CameraState {
  status: CameraStatus;
  devices: CameraDevice[];
  currentDeviceId: string | null;
  mirror: boolean;
  error: CameraError | null;
  stream: MediaStream | null;
}