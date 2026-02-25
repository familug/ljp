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
  getAccuracy
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
  assert.equal(session.currentIndex, 0, 'Current index should start at 0');
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

function testAdvanceDoesNotChangeStats() {
  let state = createSession(ALL_KANJI);
  const originalIndex = state.currentIndex;
  state = advance(state);
  assert.equal(state.stats.seen, 0);
  assert.equal(state.stats.known, 0);
  assert.equal(state.stats.unknown, 0);
  assert.ok(state.currentIndex !== originalIndex || state.pool.length === 1);
}

const tests = [
  ['filterByLevels', testFilterByLevels],
  ['createSession defaults', testCreateSessionDefaults],
  ['reveal toggle', testRevealToggle],
  ['markKnown / markUnknown / accuracy', testMarkKnownUnknownAndAccuracy],
  ['setLevels', testSetLevelsChangesPool],
  ['advance stats', testAdvanceDoesNotChangeStats]
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

