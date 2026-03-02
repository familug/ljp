export interface StrokeScoreResult {
  score: number;
  overlap: number;
  userInk: number;
  glyphInk: number;
  userOnly: number;
  glyphOnly: number;
}

const DEFAULT_ON_THRESHOLD = 0.3;
const DEFAULT_MIN_USER_INK = 12;

/**
 * Score user-drawn strokes against a reference glyph using the Dice coefficient.
 *
 * Both arrays must be RGBA pixel data (Uint8ClampedArray from getImageData).
 * Brightness per pixel is (R+G+B)/(3*255); pixels above onThreshold count as ink.
 *
 * Score = 2 * overlap / (userInk + glyphInk), scaled to 0-100.
 */
export function scoreStroke(
  userData: Uint8ClampedArray,
  glyphData: Uint8ClampedArray,
  options?: { onThreshold?: number; minUserInk?: number }
): StrokeScoreResult {
  const onThreshold = options?.onThreshold ?? DEFAULT_ON_THRESHOLD;
  const minUserInk = options?.minUserInk ?? DEFAULT_MIN_USER_INK;

  let userInk = 0;
  let glyphInk = 0;
  let overlap = 0;
  let userOnly = 0;
  let glyphOnly = 0;

  for (let i = 0; i < userData.length; i += 4) {
    const u = (userData[i] + userData[i + 1] + userData[i + 2]) / (3 * 255);
    const g = (glyphData[i] + glyphData[i + 1] + glyphData[i + 2]) / (3 * 255);

    const uOn = u > onThreshold;
    const gOn = g > onThreshold;

    if (uOn) userInk++;
    if (gOn) glyphInk++;

    if (uOn && gOn) {
      overlap++;
    } else if (uOn) {
      userOnly++;
    } else if (gOn) {
      glyphOnly++;
    }
  }

  let score: number;
  const totalInk = userInk + glyphInk;
  if (totalInk === 0 || userInk < minUserInk) {
    score = 0;
  } else {
    // Dice coefficient (F1 score): 2 * |A ∩ B| / (|A| + |B|)
    score = Math.round((2 * overlap / totalInk) * 100);
  }

  return { score, overlap, userInk, glyphInk, userOnly, glyphOnly };
}
