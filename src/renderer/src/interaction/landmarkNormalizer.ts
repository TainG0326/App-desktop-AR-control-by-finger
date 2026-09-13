import type { CalibrationData } from '@shared/types/index.js';
import { LANDMARK, type NormalizedLandmark, type TrackedHand } from '@renderer/hand-tracking/types.js';
import { pickPrimaryHand } from '@renderer/hand-tracking/parseResult.js';

export type { TrackedHand };
export { pickPrimaryHand };

/**
 * Maps a camera-space landmark to screen pixels with optional mirror
 * correction and 4-corner calibration (bilinear interpolation).
 */
export interface NormalizeOptions {
  viewportWidth: number;
  viewportHeight: number;
  mirror: boolean;
  calibration?: CalibrationData | null;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function normalizeLandmark(lm: NormalizedLandmark, opts: NormalizeOptions): ScreenPoint {
  const { viewportWidth, viewportHeight, mirror, calibration } = opts;
  if (!calibration) {
    const xRaw = mirror ? 1 - lm.x : lm.x;
    return {
      x: clamp01(xRaw) * viewportWidth,
      y: clamp01(lm.y) * viewportHeight
    };
  }
  // Bilinear interpolation across 4 corners.
  const lx = mirror ? 1 - lm.x : lm.x;
  const ly = clamp01(lm.y);

  // Top edge: from calibration.topLeft to calibration.topRight at lx.
  const topX = calibration.topLeft.screenX + (calibration.topRight.screenX - calibration.topLeft.screenX) * lx;
  const topY = calibration.topLeft.screenY + (calibration.topRight.screenY - calibration.topLeft.screenY) * lx;
  // Bottom edge.
  const botX = calibration.bottomLeft.screenX + (calibration.bottomRight.screenX - calibration.bottomLeft.screenX) * lx;
  const botY = calibration.bottomLeft.screenY + (calibration.bottomRight.screenY - calibration.bottomLeft.screenY) * lx;
  // Vertical blend.
  return {
    x: topX + (botX - topX) * ly,
    y: topY + (botY - topY) * ly
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Extract the index fingertip landmark from a tracked hand.
 * Returns null if the hand has fewer than INDEX_TIP + 1 landmarks.
 */
export function getIndexFingertip(hand: TrackedHand): NormalizedLandmark | null {
  const lm = hand.landmarks[LANDMARK.INDEX_TIP];
  return lm ?? null;
}

/**
 * Compute palm size (wrist → middle MCP) for pinch normalization.
 */
export function palmSize(hand: TrackedHand): number {
  const wrist = hand.landmarks[LANDMARK.WRIST];
  const middleMCP = hand.landmarks[LANDMARK.MIDDLE_MCP];
  if (!wrist || !middleMCP) return 1;
  const dx = wrist.x - middleMCP.x;
  const dy = wrist.y - middleMCP.y;
  const dz = (wrist.z ?? 0) - (middleMCP.z ?? 0);
  return Math.hypot(dx, dy, dz) || 1;
}