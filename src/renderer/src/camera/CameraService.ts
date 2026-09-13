import type { CameraDevice, CameraError, CameraState } from './types.js';

type Listener = (state: CameraState) => void;

const INITIAL_STATE: CameraState = {
  status: 'idle',
  devices: [],
  currentDeviceId: null,
  mirror: true,
  error: null,
  stream: null
};

function describeError(err: unknown): CameraError {
  if (!(err instanceof Error)) {
    return { code: 'unknown', message: 'Unknown camera error.' };
  }
  const name = err.name;
  const message = err.message || 'Camera error';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return { code: 'permission', message: 'Camera permission denied.' };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { code: 'not-found', message: 'No camera was found on this device.' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { code: 'in-use', message: 'Camera is in use by another application.' };
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return { code: 'overconstrained', message: 'Camera does not satisfy the requested constraints.' };
  }
  if (name === 'AbortError') {
    return { code: 'aborted', message: 'Camera start was aborted.' };
  }
  return { code: 'unknown', message };
}

/**
 * CameraService owns the device MediaStream lifecycle and emits state changes
 * to subscribers. It is platform-agnostic and does not touch React.
 *
 * Lifecycle:
 *   1. enumerate()   – populate `devices` (no permission required on Chromium
 *      because labels require an active stream; we call enumerate again after
 *      the stream starts to refresh labels).
 *   2. start()       – request permission, acquire MediaStream, transition to
 *      'streaming'. Handles errors via status + error fields.
 *   3. stop()        – stop all tracks, transition to 'idle'.
 *   4. switch()      – stop current stream, start with a new deviceId.
 *
 * Disconnect handling: subscribe to MediaStreamTrack 'ended' events and
 * transition to 'disconnected' so the UI can prompt the user to reconnect.
 */
export class CameraService {
  private state: CameraState = { ...INITIAL_STATE };
  private listeners = new Set<Listener>();
  private trackEndListeners: Array<() => void> = [];

  getState(): CameraState {
    return this.state;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private setState(patch: Partial<CameraState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((cb) => cb(this.state));
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async enumerate(): Promise<CameraDevice[]> {
    if (!this.isSupported()) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices
        .filter((d) => d.kind === 'videoinput')
        .map<CameraDevice>((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 6) || 'default'}`,
          facing: undefined
        }));
      this.setState({ devices: cams });
      return cams;
    } catch (err) {
      this.setState({ error: describeError(err) });
      return [];
    }
  }

  async start(opts: { deviceId?: string | null; mirror?: boolean } = {}): Promise<void> {
    if (!this.isSupported()) {
      this.setState({ status: 'unsupported', error: { code: 'unknown', message: 'Camera API is not available in this environment.' } });
      return;
    }

    if (this.state.stream) {
      this.stop();
    }

    this.setState({ status: 'requesting', error: null });

    const constraints: MediaStreamConstraints = {
      video: {
        ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}),
        // Lower resolution → faster MediaPipe inference. 1280x720 typically
        // bottlenecks to ~2 fps on integrated GPUs; 640x480 hits 30+ fps on
        // the same hardware while still giving MediaPipe plenty of detail.
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.attachTrackListeners(stream);
      this.setState({
        status: 'streaming',
        stream,
        currentDeviceId: this.extractDeviceId(stream),
        mirror: opts.mirror ?? this.state.mirror
      });
      // Refresh device labels now that we have permission.
      await this.enumerate();
    } catch (err) {
      const ce = describeError(err);
      const status: CameraState['status'] =
        ce.code === 'permission' ? 'denied' :
        ce.code === 'not-found' ? 'unsupported' :
        'error';
      this.setState({ status, error: ce });
    }
  }

  stop(): void {
    this.detachTrackListeners();
    if (this.state.stream) {
      this.state.stream.getTracks().forEach((t) => t.stop());
    }
    this.setState({ status: 'idle', stream: null });
  }

  async switch(deviceId: string): Promise<void> {
    await this.start({ deviceId, mirror: this.state.mirror });
  }

  setMirror(mirror: boolean): void {
    this.setState({ mirror });
  }

  private attachTrackListeners(stream: MediaStream): void {
    this.detachTrackListeners();
    stream.getVideoTracks().forEach((track) => {
      const onEnd = (): void => {
        if (this.state.stream === stream) {
          this.setState({ status: 'disconnected', stream: null });
        }
      };
      track.addEventListener('ended', onEnd);
      this.trackEndListeners.push(() => track.removeEventListener('ended', onEnd));
    });
  }

  private detachTrackListeners(): void {
    this.trackEndListeners.forEach((off) => off());
    this.trackEndListeners = [];
  }

  private extractDeviceId(stream: MediaStream): string | null {
    const settings = stream.getVideoTracks()[0]?.getSettings();
    return settings?.deviceId ?? null;
  }
}