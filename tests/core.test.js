import assert from 'node:assert/strict';
import { ALL_KANJI } from '../src/core/kanjiData.js';
import {
  filterByLevels,
  createSession,
  setLevels,
  toggleReveal,
  markKnown,
  markUnknown,
  advance,
  getAccuracy,
  normalizeLevelPreference
} from '../src/core/quizCore.js';

function testFilterByLevels() {
  const n3 = filterByLevels(ALL_KANJI, ['N3']);
  const n2 = filterByLevels(ALL_KANJI, ['N2']);
  const all = filterByLevels(ALL_KANJI, ['N2', 'N3']);

  assert.ok(n3.length > 0, 'N3 list should not be empty');
  assert.ok(n2.length > 0, 'N2 list should not be empty');
  assert.equal(all.length, n3.length + n2.length, 'ALL should be union of N3 and N2');
  assert.ok(n3.every((k) => k.level === 'N3'), 'N3 list should only contain N3 kanji');
  assert.ok(n2.every((k) => k.level === 'N2'), 'N2 list should only contain N2 kanji');
}

function testCreateSessionDefaults() {
  const session = createSession(ALL_KANJI);
  assert.equal(session.filter.levels[0], 'N3', 'Default level should be N3');
  assert.ok(session.pool.length > 0, 'Session pool should not be empty');
  assert.ok(
    session.currentIndex >= 0 && session.currentIndex < session.pool.length,
    'Current index should be within pool bounds'
  );
  assert.equal(session.stats.seen, 0);
  assert.equal(session.stats.known, 0);
  assert.equal(session.stats.unknown, 0);
  assert.equal(session.revealed, false);
}

function testRevealToggle() {
  let state = createSession(ALL_KANJI);
  assert.equal(state.revealed, false);
  state = toggleReveal(state);
  assert.equal(state.revealed, true);
  state = toggleReveal(state);
  assert.equal(state.revealed, false);
}

function testMarkKnownUnknownAndAccuracy() {
  let state = createSession(ALL_KANJI);
  const initialId = state.pool[state.currentIndex].id;

  state = markKnown(state);
  assert.equal(state.stats.seen, 1);
  assert.equal(state.stats.known, 1);
  assert.equal(state.stats.unknown, 0);
  assert.ok(state.history[0].id === initialId);

  state = markUnknown(state);
  assert.equal(state.stats.seen, 2);
  assert.equal(state.stats.known, 1);
  assert.equal(state.stats.unknown, 1);

  const accuracy = getAccuracy(state);
  assert.equal(Math.round(accuracy), 50);
}

function testSetLevelsChangesPool() {
  let state = createSession(ALL_KANJI, { levels: ['N3'] });
  state = setLevels(state, ALL_KANJI, ['N2']);
  const n2Count = state.pool.length;
  assert.ok(n2Count > 0, 'N2 pool should not be empty');
  assert.ok(state.pool.every((k) => k.level === 'N2'), 'All kanji should now be N2');
}

function testSetLevelsPreservesStats() {
  let state = createSession(ALL_KANJI, { levels: ['N3'] });
  state = markKnown(state);
  state = markUnknown(state);
  assert.equal(state.stats.seen, 2);
  assert.equal(state.stats.known, 1);
  state = setLevels(state, ALL_KANJI, ['N5']);
  assert.equal(state.stats.seen, 2, 'stats.seen should be preserved');
  assert.equal(state.stats.known, 1, 'stats.known should be preserved');
  state = setLevels(state, ALL_KANJI, ['N3']);
  assert.equal(state.stats.seen, 2, 'stats.seen should still be preserved');
  assert.equal(state.stats.known, 1, 'stats.known should still be preserved');
}

function testAdvanceDoesNotChangeStats() {
  let state = createSession(ALL_KANJI);
  const originalIndex = state.currentIndex;
  state = advance(state);
  assert.equal(state.stats.seen, 0);
  assert.equal(state.stats.known, 0);
  assert.equal(state.stats.unknown, 0);
  assert.ok(state.currentIndex !== originalIndex || state.pool.length === 1);
}

function testNormalizeLevelPreferenceValidValues() {
  assert.equal(
    normalizeLevelPreference('N5', 'N3'),
    'N5',
    'Should keep a valid JLPT level value'
  );
  assert.equal(
    normalizeLevelPreference('ALL', 'N3'),
    'ALL',
    'Should keep a special ALL level value'
  );
}

function testNormalizeLevelPreferenceInvalidOrEmpty() {
  assert.equal(
    normalizeLevelPreference('', 'N3'),
    'N3',
    'Empty string should fall back to provided default'
  );
  assert.equal(
    normalizeLevelPreference('UNKNOWN', 'N2'),
    'N2',
    'Unknown value should fall back to provided default'
  );
}

function testNormalizeLevelPreferenceNonString() {
  assert.equal(
    normalizeLevelPreference(null, 'N3'),
    'N3',
    'Null should fall back to default'
  );
  assert.equal(
    normalizeLevelPreference(undefined, 'N3'),
    'N3',
    'Undefined should fall back to default'
  );
  assert.equal(
    normalizeLevelPreference(42, 'N3'),
    'N3',
    'Non-string should fall back to default'
  );
}

const tests = [
  ['filterByLevels', testFilterByLevels],
  ['createSession defaults', testCreateSessionDefaults],
  ['reveal toggle', testRevealToggle],
  ['markKnown / markUnknown / accuracy', testMarkKnownUnknownAndAccuracy],
  ['setLevels', testSetLevelsChangesPool],
  ['setLevels preserves stats', testSetLevelsPreservesStats],
  ['advance stats', testAdvanceDoesNotChangeStats],
  ['normalizeLevelPreference valid values', testNormalizeLevelPreferenceValidValues],
  ['normalizeLevelPreference invalid or empty', testNormalizeLevelPreferenceInvalidOrEmpty],
  ['normalizeLevelPreference non-string', testNormalizeLevelPreferenceNonString]
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    // eslint-disable-next-line no-console
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    // eslint-disable-next-line no-console
    console.error(`❌ ${name}`);
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  // eslint-disable-next-line no-console
  console.log(`\nAll ${tests.length} tests passed.`);
}

