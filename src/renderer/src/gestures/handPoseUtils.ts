import { LANDMARK } from '@renderer/hand-tracking/types.js';
import type { TrackedHand, NormalizedLandmark } from '@renderer/hand-tracking/types.js';
import { palmSize } from '@renderer/interaction/landmarkNormalizer.js';

/** All 5 fingertips in landmark index order. */
const TIP_INDICES = [
  LANDMARK.THUMB_TIP,
  LANDMARK.INDEX_TIP,
  LANDMARK.MIDDLE_TIP,
  LANDMARK.RING_TIP,
  LANDMARK.PINKY_TIP
];

/** MCP joints for palm-center computation. */
const PALM_CENTER_JOINTS = [
  LANDMARK.WRIST,
  LANDMARK.INDEX_MCP,
  LANDMARK.MIDDLE_MCP,
  LANDMARK.RING_MCP,
  LANDMARK.PINKY_MCP
];

/**
 * Palm center = average of wrist + 4 MCP joints. More stable than
 * the wrist alone, which moves when the wrist rotates.
 */
export function computePalmCenter(hand: TrackedHand): NormalizedLandmark {
  let x = 0, y = 0, z = 0;
  let count = 0;
  for (const idx of PALM_CENTER_JOINTS) {
    const lm = hand.landmarks[idx];
    if (!lm) continue;
    x += lm.x;
    y += lm.y;
    z += lm.z ?? 0;
    count++;
  }
  if (count === 0) return { x: 0, y: 0, z: 0 };
  return { x: x / count, y: y / count, z: z / count };
}

/**
 * Checks that all 5 fingertips exist and the hand meets minimum confidence.
 */
function allFiveFingersVisible(hand: TrackedHand): boolean {
  if (hand.score < 0.5) return false;
  for (const idx of TIP_INDICES) {
    if (!hand.landmarks[idx]) return false;
  }
  return true;
}

/**
 * Pose gate: the hand must be in a STRICT "5-finger open" pose before zoom
 * activation. This is intentionally demanding — only an unambiguous open
 * palm passes. Anything ambiguous (fist, 1-finger point, partial curl,
 * hand at awkward angle) returns false so click/drag keep working.
 *
 * Three independent checks must ALL pass:
 *
 *   1. MIN EXTENSION: every fingertip (except thumb) is at least
 *      minFingerExtension × palm_size away from palm center.
 *      Default 0.55 — well beyond the natural curl range, so a
 *      relaxed/open-but-bent hand fails.
 *
 *   2. SYMMETRY: the four non-thumb fingertips must all be at similar
 *      extension levels. If any one finger is significantly shorter than
 *      the others, the hand is NOT fully open (e.g. 1-finger point has
 *      one fully-extended finger and 3 curled ones).
 *      minSymmetryRatio = 0.65 means each finger must reach at least
 *      65% of the most-extended finger's distance.
 *
 *   3. THUMB EXTENSION: the thumb tip must be clearly away from the
 *      index-finger MCP (the "base" of the hand). A thumb tucked
 *      against the side of the palm fails this check, which is exactly
 *      the pose of a 2-finger pinch.
 *
 * This combination rejects:
 *   - 1-finger point → SYMMETRY fails (4 fingers curled)
 *   - 2-finger pinch → THUMB fails + SYMMETRY fails
 *   - Fist / drag with all fingers curled → MIN EXTENSION fails
 *   - Relaxed hand with fingers partially bent → MIN EXTENSION fails
 *
 * And accepts:
 *   - Genuinely open palm, all 5 fingers clearly extended
 */
export function isHandFullyOpen(
  hand: TrackedHand,
  minFingerExtension = 0.55,
  minSymmetryRatio = 0.65
): boolean {
  if (!allFiveFingersVisible(hand)) return false;
  const size = palmSize(hand);
  if (size <= 0) return false;
  const palmCenter = computePalmCenter(hand);

  // ── Check 1 & 2: per-finger extension + symmetry for the 4 non-thumb fingers
  const fingerDistances: number[] = [];
  const NON_THUMB_TIPS = TIP_INDICES.slice(1); // INDEX, MIDDLE, RING, PINKY
  for (const idx of NON_THUMB_TIPS) {
    const tip = hand.landmarks[idx]!;
    const dx = tip.x - palmCenter.x;
    const dy = tip.y - palmCenter.y;
    const dz = (tip.z ?? 0) - palmCenter.z;
    const d = Math.hypot(dx, dy, dz);
    fingerDistances.push(d);
    if (d < size * minFingerExtension) return false;
  }

  // Symmetry: every finger must reach at least minSymmetryRatio × max(fingerDistances)
  const maxDist = Math.max(...fingerDistances);
  if (maxDist <= 0) return false;
  for (const d of fingerDistances) {
    if (d < maxDist * minSymmetryRatio) return false;
  }

  // ── Check 3: thumb extension (separate from the others because the
  //    thumb's natural rest is sideways, not "up")
  const thumbTip = hand.landmarks[LANDMARK.THUMB_TIP]!;
  const indexMcp = hand.landmarks[LANDMARK.INDEX_MCP]!;
  const thumbDx = thumbTip.x - indexMcp.x;
  const thumbDy = thumbTip.y - indexMcp.y;
  const thumbDz = (thumbTip.z ?? 0) - (indexMcp.z ?? 0);
  const thumbDist = Math.hypot(thumbDx, thumbDy, thumbDz);
  // The thumb in an open palm is roughly 0.7–0.9 × palm size away from
  // the index MCP. Require ≥ 0.55 × palm_size.
  if (thumbDist < size * 0.55) return false;

  return true;
}

/**
 * Compute per-finger extension as a quick numeric measure of how "open"
 * the hand is. Used for diagnostics + smoother gating.
 *
 * Returns a value in [0, ~2.0] where:
 *   - ~0.3–0.4 = fist / very curled
 *   - ~0.5–0.7 = relaxed hand / partial curl
 *   - ~0.9–1.2 = clearly open palm
 *   - > 1.3 = very stretched / fingers spread
 */
export function getHandOpenness(hand: TrackedHand): number {
  if (!allFiveFingersVisible(hand)) return 0;
  const size = palmSize(hand);
  if (size <= 0) return 0;
  const palmCenter = computePalmCenter(hand);
  let sum = 0;
  for (const idx of TIP_INDICES) {
    const tip = hand.landmarks[idx]!;
    const dx = tip.x - palmCenter.x;
    const dy = tip.y - palmCenter.y;
    const dz = (tip.z ?? 0) - palmCenter.z;
    sum += Math.hypot(dx, dy, dz);
  }
  return sum / (5 * size);
}

/**
 * Checks if the hand is in a "5-finger closed" pose — all fingertips
 * are tucked close to the palm. Useful for detecting the fist/five-finger-close
 * gesture that might also trigger a zoom-out signal.
 */
export function isHandFullyClosed(hand: TrackedHand): boolean {
  if (!allFiveFingersVisible(hand)) return false;
  const size = palmSize(hand);
  if (size <= 0) return false;
  const palmCenter = computePalmCenter(hand);
  const maxDist = size * 0.55; // A finger counts as "closed" if within 55% of palm size
  for (const idx of TIP_INDICES) {
    const tip = hand.landmarks[idx]!;
    const dx = tip.x - palmCenter.x;
    const dy = tip.y - palmCenter.y;
    const dz = (tip.z ?? 0) - palmCenter.z;
    if (Math.hypot(dx, dy, dz) > maxDist) return false;
  }
  return true;
}

/**
 * Average fingertip-to-palm-center distance, normalized by palm size.
 * Larger value = more spread-out (open) hand.
 * Used as a quick scalar measure of hand openness.
 */
export function computeHandSpread(hand: TrackedHand): number {
  if (!allFiveFingersVisible(hand)) return 0;
  const size = palmSize(hand);
  if (size <= 0) return 0;
  const palmCenter = computePalmCenter(hand);
  let sum = 0;
  let count = 0;
  for (const idx of TIP_INDICES) {
    const tip = hand.landmarks[idx]!;
    const dx = tip.x - palmCenter.x;
    const dy = tip.y - palmCenter.y;
    const dz = (tip.z ?? 0) - palmCenter.z;
    sum += Math.hypot(dx, dy, dz);
    count++;
  }
  return count > 0 ? sum / (count * size) : 0;
}
