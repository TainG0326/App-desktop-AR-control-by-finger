/**
 * Hand tracking types — pure data, shared with the gesture engine.
 */

export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20
} as const;

export type LandmarkIndex = (typeof LANDMARK)[keyof typeof LANDMARK];

export type Handedness = 'Left' | 'Right';

export interface NormalizedLandmark {
  /** x in [0..1], camera-space, left → right */
  x: number;
  /** y in [0..1], camera-space, top → bottom */
  y: number;
  /** depth in normalized units; negative is closer to camera */
  z: number;
}

export interface TrackedHand {
  handedness: Handedness;
  /** Detection confidence [0..1] */
  score: number;
  /** 21 landmarks in camera-space */
  landmarks: ReadonlyArray<NormalizedLandmark>;
  /** 21 world-space landmarks (optional; provided by HandLandmarker) */
  worldLandmarks: ReadonlyArray<NormalizedLandmark>;
}

export interface HandFrame {
  /** Empty when no hand is detected */
  hands: ReadonlyArray<TrackedHand>;
  /** Wall-clock timestamp when the frame was processed */
  timestampMs: number;
  /** Inference latency for this frame in ms */
  inferenceMs: number;
  /** Current rolling FPS */
  fps: number;
}

export type TrackerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'running'
  | 'error'
  | 'disposed';

export interface TrackerState {
  status: TrackerStatus;
  fps: number;
  inferenceMs: number;
  error: string | null;
  lastFrame: HandFrame | null;
}