import type { NormalizedLandmark, Handedness, TrackedHand } from './types.js';

/**
 * MediaPipe HandLandmarker `HandLandmarkerResult` shape (subset we use).
 * Kept loose to avoid coupling to internal package types.
 */
export interface RawHandLandmarkerResult {
  landmarks?: Array<{ x: number; y: number; z: number }>[];
  handednesses?: Array<{
    categoryName?: string;
    score?: number;
  }>[];
  worldLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
}

/**
 * Convert MediaPipe HandLandmarker result into our typed TrackedHand[].
 * Pure function so it's straightforward to unit test.
 *
 * HandLandmarker returns `landmarks` and `handednesses` as parallel arrays;
 * each entry in `landmarks` corresponds to the same index in `handednesses`.
 */
export function parseResult(
  result: RawHandLandmarkerResult | null | undefined,
  fallbackHandedness: Handedness = 'Right'
): TrackedHand[] {
  if (!result || !result.landmarks || result.landmarks.length === 0) return [];

  const handednessArr = result.handednesses ?? [];
  const worldArr = result.worldLandmarks ?? [];

  return result.landmarks.map((det, i) => {
    const landmarks = (det ?? []) as NormalizedLandmark[];
    const handInfo = handednessArr[i]?.[0];
    const handedness: Handedness =
      handInfo?.categoryName === 'Left' ? 'Left' : fallbackHandedness;
    const score = handInfo?.score ?? 0;
    const worldLandmarks = (worldArr[i] ?? []) as NormalizedLandmark[];
    return {
      handedness,
      score,
      landmarks,
      worldLandmarks
    } satisfies TrackedHand;
  });
}

/**
 * Pick the highest-confidence hand as the "primary" hand.
 * Used to drive the cursor when multiple hands are present.
 */
export function pickPrimaryHand(hands: ReadonlyArray<TrackedHand>): TrackedHand | null {
  if (hands.length === 0) return null;
  let best = hands[0];
  for (let i = 1; i < hands.length; i++) {
    if (hands[i].score > best.score) best = hands[i];
  }
  return best;
}