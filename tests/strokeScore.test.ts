import assert from 'node:assert/strict';
import { scoreStroke } from '../src/core/strokeScore.js';

/** Create RGBA pixel data from an array of brightness values (0-255). */
function makePixels(brightnesses: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(brightnesses.length * 4);
  for (let i = 0; i < brightnesses.length; i++) {
    const v = brightnesses[i];
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Create a grid of brightness values. 255 = ink, 0 = background. */
function grid(rows: number[][]): number[] {
  return rows.flat();
}

// --- tests ---

function testPerfectOverlap(): void {
  // User and glyph are identical → score should be 100
  const pattern = grid([
    [0, 255, 255, 0],
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 255, 255, 0],
  ]);
  const user = makePixels(pattern);
  const glyph = makePixels(pattern);
  const result = scoreStroke(user, glyph, { minUserInk: 1 });
  assert.equal(result.score, 100, 'Perfect overlap should score 100');
  assert.equal(result.overlap, result.userInk);
  assert.equal(result.overlap, result.glyphInk);
  assert.equal(result.userOnly, 0);
  assert.equal(result.glyphOnly, 0);
}

function testNoOverlap(): void {
  // User draws where glyph is empty, and vice versa → score should be 0
  const userPattern = grid([
    [255, 255, 0, 0],
    [255, 255, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const glyphPattern = grid([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 255, 255],
    [0, 0, 255, 255],
  ]);
  const result = scoreStroke(makePixels(userPattern), makePixels(glyphPattern), {
    minUserInk: 1,
  });
  assert.equal(result.score, 0, 'No overlap should score 0');
  assert.equal(result.overlap, 0);
  assert.equal(result.userOnly, 4);
  assert.equal(result.glyphOnly, 4);
}

function testPartialOverlap(): void {
  // 50% overlap: Dice = 2*2 / (4+4) = 0.5 → score 50
  const userPattern = grid([
    [255, 255, 0, 0],
    [255, 255, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const glyphPattern = grid([
    [0, 255, 255, 0],
    [0, 255, 255, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = scoreStroke(makePixels(userPattern), makePixels(glyphPattern), {
    minUserInk: 1,
  });
  // overlap=2 (positions [0][1] and [1][1]), userInk=4, glyphInk=4
  // Dice = 2*2/(4+4) = 0.5 → 50
  assert.equal(result.score, 50, 'Partial overlap should score 50');
  assert.equal(result.overlap, 2);
}

function testRandomScribbleScoresLow(): void {
  // User covers entire 8x8 canvas, glyph has only a small region.
  // This simulates random scribbling — should score low.
  const size = 8;
  const total = size * size; // 64

  const userBright = new Array(total).fill(255); // scribble everywhere
  const glyphBright = new Array(total).fill(0);
  // Glyph has 8 ink pixels in the center
  for (let r = 3; r <= 4; r++) {
    for (let c = 3; c <= 6; c++) {
      glyphBright[r * size + c] = 255;
    }
  }
  const glyphInkCount = glyphBright.filter((v) => v === 255).length; // 8

  const result = scoreStroke(makePixels(userBright), makePixels(glyphBright), {
    minUserInk: 1,
  });

  // Dice = 2*8 / (64+8) = 16/72 ≈ 22
  assert.ok(result.score <= 25, `Random scribble should score low, got ${result.score}`);
  assert.equal(result.overlap, glyphInkCount);
  assert.equal(result.userInk, total);
}

function testTooLittleInk(): void {
  // User draws very little (below minUserInk threshold) → score 0
  const userPattern = grid([
    [0, 0, 0, 0],
    [0, 255, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const glyphPattern = grid([
    [0, 255, 255, 0],
    [0, 255, 255, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  // Default minUserInk is 12, user only has 1 ink pixel
  const result = scoreStroke(makePixels(userPattern), makePixels(glyphPattern));
  assert.equal(result.score, 0, 'Too little ink should score 0');
  assert.equal(result.userInk, 1);
}

function testEmptyCanvases(): void {
  const empty = makePixels(new Array(16).fill(0));
  const result = scoreStroke(empty, empty, { minUserInk: 1 });
  assert.equal(result.score, 0, 'Empty canvases should score 0');
  assert.equal(result.userInk, 0);
  assert.equal(result.glyphInk, 0);
}

function testUserCoversAllGlyph(): void {
  // User ink is a superset of glyph ink — high overlap but penalized for extra ink
  const glyphPattern = grid([
    [0, 0, 0, 0],
    [0, 255, 255, 0],
    [0, 255, 255, 0],
    [0, 0, 0, 0],
  ]);
  // User covers 12 out of 16 pixels
  const userPattern = grid([
    [255, 255, 255, 0],
    [255, 255, 255, 0],
    [255, 255, 255, 0],
    [255, 255, 255, 0],
  ]);
  const result = scoreStroke(makePixels(userPattern), makePixels(glyphPattern), {
    minUserInk: 1,
  });
  // overlap=4, userInk=12, glyphInk=4
  // Dice = 2*4 / (12+4) = 8/16 = 0.5 → 50
  assert.equal(result.score, 50, 'Over-drawing should be penalized');
  assert.equal(result.overlap, 4);
}

function testUserDrawsHalfGlyph(): void {
  // User draws only the left half of the glyph — penalized for missing ink
  const glyphPattern = grid([
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const userPattern = grid([
    [255, 255, 0, 0],
    [255, 255, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = scoreStroke(makePixels(userPattern), makePixels(glyphPattern), {
    minUserInk: 1,
  });
  // overlap=4, userInk=4, glyphInk=8
  // Dice = 2*4 / (4+8) = 8/12 ≈ 0.667 → 67
  assert.equal(result.score, 67, 'Drawing half the glyph should score ~67');
  assert.equal(result.overlap, 4);
  assert.equal(result.glyphOnly, 4);
}

function testGuideBrightnessIgnored(): void {
  // Simulate guide kanji at ~22% opacity on dark background.
  // Composited brightness ≈ 0.247, which should be below the 0.3 threshold.
  const guideBrightness = Math.round(0.247 * 255); // ~63

  const userPattern = new Array(16).fill(guideBrightness); // all guide, no real strokes
  const glyphPattern = grid([
    [0, 0, 0, 0],
    [0, 255, 255, 0],
    [0, 255, 255, 0],
    [0, 0, 0, 0],
  ]);
  const result = scoreStroke(makePixels(userPattern), makePixels(glyphPattern), {
    minUserInk: 1,
  });
  // Guide brightness is below threshold, so userInk should be 0
  assert.equal(result.userInk, 0, 'Guide brightness should not count as ink');
  assert.equal(result.score, 0, 'Canvas with only guide should score 0');
}

function testCustomThreshold(): void {
  // A brightness of 100 (~0.39) is above default 0.3 but below custom 0.5
  const mid = 100;
  const user = makePixels([mid, mid, mid, mid, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  const glyph = makePixels([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);

  const defaultResult = scoreStroke(user, glyph, { minUserInk: 1 });
  // With default threshold 0.3: userInk=8, glyphInk=8, overlap=8 → score 100
  assert.equal(defaultResult.userInk, 8, 'Default threshold counts mid-brightness as ink');

  const strictResult = scoreStroke(user, glyph, { onThreshold: 0.5, minUserInk: 1 });
  // With 0.5 threshold: mid pixels (0.39) are below threshold
  // userInk=4, glyphInk=8, overlap=4 → Dice = 2*4/(4+8) ≈ 67
  assert.equal(strictResult.userInk, 4, 'Strict threshold excludes mid-brightness');
  assert.equal(strictResult.score, 67, 'Strict threshold lowers score');
}

function testDiceSymmetry(): void {
  // Dice(A,B) should equal Dice(B,A)
  const a = grid([
    [255, 255, 0, 0],
    [255, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const b = grid([
    [0, 255, 255, 0],
    [0, 0, 255, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const r1 = scoreStroke(makePixels(a), makePixels(b), { minUserInk: 1 });
  const r2 = scoreStroke(makePixels(b), makePixels(a), { minUserInk: 1 });
  assert.equal(r1.score, r2.score, 'Dice score should be symmetric');
}

const tests: Array<[string, () => void]> = [
  ['perfect overlap scores 100', testPerfectOverlap],
  ['no overlap scores 0', testNoOverlap],
  ['partial overlap scores proportionally', testPartialOverlap],
  ['random scribble scores low', testRandomScribbleScoresLow],
  ['too little ink scores 0', testTooLittleInk],
  ['empty canvases score 0', testEmptyCanvases],
  ['over-drawing is penalized', testUserCoversAllGlyph],
  ['under-drawing is penalized', testUserDrawsHalfGlyph],
  ['guide brightness is below threshold', testGuideBrightnessIgnored],
  ['custom threshold changes detection', testCustomThreshold],
  ['Dice score is symmetric', testDiceSymmetry],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`\nAll ${tests.length} tests passed.`);
}
