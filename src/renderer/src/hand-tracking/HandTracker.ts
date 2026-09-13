import type {
  FilesetResolver,
  HandLandmarker as MediaPipeHandLandmarker
} from '@mediapipe/tasks-vision';
import { parseResult, type RawHandLandmarkerResult } from './parseResult.js';
import type { HandFrame, TrackerState } from './types.js';

/**
 * Lazy-imported MediaPipe modules so test environments without WebGL/WASM
 * can still import this file (they just won't be able to actually init).
 */
type MediaPipeModules = {
  FilesetResolver: typeof FilesetResolver;
  HandLandmarker: typeof MediaPipeHandLandmarker;
};

type FrameListener = (frame: HandFrame) => void;
type StateListener = (state: TrackerState) => void;

export interface HandTrackerOptions {
  /** URL of the WASM fileset. Defaults to MediaPipe CDN. */
  wasmBaseUrl?: string;
  /** URL of the .task model. Defaults to MediaPipe CDN. */
  modelUrl?: string;
  /** Number of hands to track (1 or 2). */
  numHands?: 1 | 2;
  /** Minimum confidence to keep a hand. */
  minConfidence?: number;
  /** Target inference FPS (capped by hardware). */
  fpsTarget?: number;
}

const DEFAULT_OPTIONS: Required<HandTrackerOptions> = {
  wasmBaseUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
  modelUrl:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  numHands: 2,
  minConfidence: 0.6,
  fpsTarget: 30
};

const INITIAL_STATE: TrackerState = {
  status: 'idle',
  fps: 0,
  inferenceMs: 0,
  error: null,
  lastFrame: null
};

/**
 * Hand tracker service.
 *
 * Lifecycle:
 *   init(opts) — loads WASM + model
 *   start(video) — begins inference loop on the provided <video>
 *   stop() — cancels loop, keeps model loaded
 *   dispose() — closes MediaPipe graph, releases memory
 */
export class HandTracker {
  private options: Required<HandTrackerOptions>;
  private state: TrackerState = { ...INITIAL_STATE };
  private listeners = new Set<FrameListener>();
  private stateListeners = new Set<StateListener>();

  private landmarker: MediaPipeHandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private rafHandle: number | null = null;
  private lastTickMs = 0;
  private minIntervalMs: number;

  // Rolling FPS window
  private frameTimes: number[] = [];
  private fpsWindow = 30;
  private lastInferenceMs = 0;

  // Allows tests to inject a mock landmarker.
  private moduleLoader: () => Promise<MediaPipeModules>;
  private landmarkerFactory?: (modules: MediaPipeModules, opts: HandTrackerOptions) => Promise<MediaPipeHandLandmarker>;

  constructor(opts: HandTrackerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...opts };
    this.minIntervalMs = 1000 / this.options.fpsTarget;
    this.moduleLoader = () => defaultLoadMediaPipe();
  }

  getState(): TrackerState {
    return this.state;
  }

  onFrame(cb: FrameListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onState(cb: StateListener): () => void {
    this.stateListeners.add(cb);
    cb(this.state);
    return () => this.stateListeners.delete(cb);
  }

  /** Test seam: inject a custom loader / factory. */
  __setDependencies(deps: {
    loader?: () => Promise<MediaPipeModules>;
    factory?: (modules: MediaPipeModules, opts: HandTrackerOptions) => Promise<MediaPipeHandLandmarker>;
  }): void {
    if (deps.loader) this.moduleLoader = deps.loader;
    if (deps.factory) this.landmarkerFactory = deps.factory;
  }

  async init(): Promise<void> {
    if (this.state.status === 'loading' || this.state.status === 'ready') return;
    this.setState({ status: 'loading', error: null });
    try {
      const modules = await this.moduleLoader();
      if (this.landmarkerFactory) {
        this.landmarker = await this.landmarkerFactory(modules, this.options);
      } else {
        const fileset = await modules.FilesetResolver.forVisionTasks(this.options.wasmBaseUrl);
        this.landmarker = await modules.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: this.options.modelUrl,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: this.options.numHands,
          minHandDetectionConfidence: this.options.minConfidence,
          minHandPresenceConfidence: this.options.minConfidence,
          minTrackingConfidence: this.options.minConfidence
        });
      }
      this.setState({ status: 'ready' });
    } catch (err) {
      this.setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to initialize hand tracker.'
      });
      throw err;
    }
  }

  start(video: HTMLVideoElement): void {
    if (!this.landmarker) {
      this.setState({
        status: 'error',
        error: 'HandTracker.start() called before init().'
      });
      return;
    }
    if (this.state.status === 'running') return;
    this.video = video;
    this.lastTickMs = 0;
    this.frameTimes = [];
    this.setState({ status: 'running' });
    this.scheduleNextFrame();
  }

  stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.video = null;
    if (this.state.status === 'running') {
      this.setState({ status: 'ready' });
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        // close() can throw if already disposed; ignored.
      }
      this.landmarker = null;
    }
    this.setState({ status: 'disposed', fps: 0, inferenceMs: 0, lastFrame: null });
  }

  private scheduleNextFrame(): void {
    this.rafHandle = requestAnimationFrame(() => this.tick());
  }

  private async tick(): Promise<void> {
    if (!this.video || !this.landmarker) return;
    const now = performance.now();
    if (this.lastTickMs > 0 && now - this.lastTickMs < this.minIntervalMs) {
      this.scheduleNextFrame();
      return;
    }
    this.lastTickMs = now;

    if (this.video.readyState < 2) {
      this.scheduleNextFrame();
      return;
    }

    const t0 = performance.now();
    let result: RawHandLandmarkerResult | null = null;
    try {
      result = (this.landmarker.detectForVideo(this.video, now) as unknown as RawHandLandmarkerResult) ?? null;
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err.message : 'Inference failed.'
      });
      this.scheduleNextFrame();
      return;
    }
    const t1 = performance.now();
    this.lastInferenceMs = t1 - t0;

    const hands = parseResult(result);
    const fps = this.computeFps(now);

    const frame: HandFrame = {
      hands,
      timestampMs: now,
      inferenceMs: this.lastInferenceMs,
      fps
    };

    this.setState({ lastFrame: frame, fps, inferenceMs: this.lastInferenceMs });
    this.listeners.forEach((cb) => cb(frame));
    this.scheduleNextFrame();
  }

  private computeFps(now: number): number {
    this.frameTimes.push(now);
    while (this.frameTimes.length > this.fpsWindow) this.frameTimes.shift();
    if (this.frameTimes.length < 2) return 0;
    const span = this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0];
    if (span <= 0) return 0;
    return ((this.frameTimes.length - 1) * 1000) / span;
  }

  private setState(patch: Partial<TrackerState>): void {
    this.state = { ...this.state, ...patch };
    this.stateListeners.forEach((cb) => cb(this.state));
  }
}

async function defaultLoadMediaPipe(): Promise<MediaPipeModules> {
  // Dynamic import keeps the module out of the test bundle unless used.
  const mod = await import('@mediapipe/tasks-vision');
  return {
    FilesetResolver: mod.FilesetResolver,
    HandLandmarker: mod.HandLandmarker
  };
}