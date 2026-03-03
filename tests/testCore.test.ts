import assert from 'node:assert/strict';
import type { Kanji, SrsState } from '../src/types.js';
import {
  getDueKanji,
  pickDistractors,
  generateQuestion,
  createTestSession,
  answerQuestion,
  nextQuestion,
  computeScore,
  getWrongAnswers,
  testResultsToSrsGrades
} from '../src/core/testCore.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1700000000000;

function makeKanji(id: string, level: string, char: string, opts?: Partial<Kanji>): Kanji {
  return {
    id,
    level,
    kanji: char,
    onyomi: ['オン'],
    kunyomi: ['くん'],
    meanings: [`meaning-${char}`],
    example: { sentence: '', reading: '', translation: '' },
    ...opts
  };
}

const POOL: Kanji[] = [
  makeKanji('N3-学', 'N3', '学', { onyomi: ['ガク'], kunyomi: ['まな.ぶ'], meanings: ['study'] }),
  makeKanji('N3-生', 'N3', '生', { onyomi: ['セイ'], kunyomi: ['い.きる'], meanings: ['life'] }),
  makeKanji('N3-食', 'N3', '食', { onyomi: ['ショク'], kunyomi: ['た.べる'], meanings: ['eat'] }),
  makeKanji('N3-時', 'N3', '時', { onyomi: ['ジ'], kunyomi: ['とき'], meanings: ['time'] }),
  makeKanji('N3-年', 'N3', '年', { onyomi: ['ネン'], kunyomi: ['とし'], meanings: ['year'] }),
  makeKanji('N3-日', 'N3', '日', { onyomi: ['ニチ'], kunyomi: ['ひ'], meanings: ['day'] }),
  makeKanji('N3-中', 'N3', '中', { onyomi: ['チュウ'], kunyomi: ['なか'], meanings: ['middle'] }),
  makeKanji('N3-大', 'N3', '大', { onyomi: ['ダイ'], kunyomi: ['おお.きい'], meanings: ['big'] }),
  makeKanji('N3-出', 'N3', '出', { onyomi: ['シュツ'], kunyomi: ['で.る'], meanings: ['exit'] }),
  makeKanji('N3-前', 'N3', '前', { onyomi: ['ゼン'], kunyomi: ['まえ'], meanings: ['before'] }),
  makeKanji('N2-読', 'N2', '読', { onyomi: ['ドク'], kunyomi: ['よ.む'], meanings: ['read'] }),
  makeKanji('N2-書', 'N2', '書', { onyomi: ['ショ'], kunyomi: ['か.く'], meanings: ['write'] }),
  makeKanji('N2-話', 'N2', '話', { onyomi: ['ワ'], kunyomi: ['はな.す'], meanings: ['talk'] }),
  makeKanji('N2-聞', 'N2', '聞', { onyomi: ['ブン'], kunyomi: ['き.く'], meanings: ['hear'] }),
  makeKanji('N2-見', 'N2', '見', { onyomi: ['ケン'], kunyomi: ['み.る'], meanings: ['see'] }),
  makeKanji('N2-言', 'N2', '言', { onyomi: ['ゲン'], kunyomi: ['い.う'], meanings: ['say'] }),
  makeKanji('N2-知', 'N2', '知', { onyomi: ['チ'], kunyomi: ['し.る'], meanings: ['know'] }),
  makeKanji('N2-思', 'N2', '思', { onyomi: ['シ'], kunyomi: ['おも.う'], meanings: ['think'] }),
  makeKanji('N2-行', 'N2', '行', { onyomi: ['コウ'], kunyomi: ['い.く'], meanings: ['go'] }),
  makeKanji('N2-来', 'N2', '来', { onyomi: ['ライ'], kunyomi: ['く.る'], meanings: ['come'] }),
  makeKanji('N2-作', 'N2', '作', { onyomi: ['サク'], kunyomi: ['つく.る'], meanings: ['make'] }),
  makeKanji('N2-持', 'N2', '持', { onyomi: ['ジ'], kunyomi: ['も.つ'], meanings: ['hold'] }),
];

// --- getDueKanji ---

function testGetDueKanjiAllNewAreDue(): void {
  const due = getDueKanji(POOL, {}, NOW);
  assert.equal(due.length, POOL.length, 'All new kanji should be due');
}

function testGetDueKanjiFiltersNotDue(): void {
  const perKanji: Record<string, Record<string, unknown>> = {
    'N3-学': { due: NOW + DAY_MS, interval: 1, repetitions: 1, ease: 2.5, lastReviewed: NOW - DAY_MS }
  };
  const due = getDueKanji(POOL, perKanji, NOW);
  assert.equal(due.length, POOL.length - 1, 'Should exclude kanji not yet due');
  assert.ok(!due.some((k) => k.id === 'N3-学'), 'N3-学 should not be due');
}

function testGetDueKanjiIncludesPastDue(): void {
  const perKanji: Record<string, Record<string, unknown>> = {
    'N3-学': { due: NOW - 1000, interval: 1, repetitions: 1, ease: 2.5, lastReviewed: NOW - DAY_MS }
  };
  const due = getDueKanji(POOL, perKanji, NOW);
  assert.ok(due.some((k) => k.id === 'N3-学'), 'Past-due kanji should be included');
}

// --- pickDistractors ---

function testPickDistractorsExcludesTarget(): void {
  const distractors = pickDistractors(POOL, 'N3-学', 3);
  assert.equal(distractors.length, 3, 'Should pick exactly 3 distractors');
  assert.ok(!distractors.some((k) => k.id === 'N3-学'), 'Should not include target');
}

function testPickDistractorsHandlesSmallPool(): void {
  const smallPool = POOL.slice(0, 2);
  const distractors = pickDistractors(smallPool, smallPool[0].id, 3);
  assert.equal(distractors.length, 1, 'Should only return available distractors');
}

// --- generateQuestion ---

function testGenerateKanjiToMeaning(): void {
  const target = POOL[0];
  const q = generateQuestion('kanji-to-meaning', target, POOL);
  assert.equal(q.type, 'kanji-to-meaning');
  assert.equal(q.kanjiId, target.id);
  assert.equal(q.prompt, target.kanji);
  assert.equal(q.choices.length, 4);
  assert.equal(q.choices[q.correctIndex], 'study');
}

function testGenerateMeaningToKanji(): void {
  const target = POOL[0];
  const q = generateQuestion('meaning-to-kanji', target, POOL);
  assert.equal(q.type, 'meaning-to-kanji');
  assert.equal(q.prompt, 'study');
  assert.equal(q.choices[q.correctIndex], '学');
}

function testGenerateKanjiToReading(): void {
  const target = POOL[0];
  const q = generateQuestion('kanji-to-reading', target, POOL);
  assert.equal(q.type, 'kanji-to-reading');
  assert.equal(q.prompt, target.kanji);
  assert.equal(q.choices[q.correctIndex], 'まな.ぶ');
}

function testGenerateReadingToKanji(): void {
  const target = POOL[0];
  const q = generateQuestion('reading-to-kanji', target, POOL);
  assert.equal(q.type, 'reading-to-kanji');
  assert.equal(q.prompt, 'まな.ぶ');
  assert.equal(q.choices[q.correctIndex], '学');
}

function testGenerateQuestionNoReadings(): void {
  const noReadingKanji = makeKanji('N3-x', 'N3', 'x', { onyomi: [], kunyomi: [] });
  const q = generateQuestion('kanji-to-meaning', noReadingKanji, POOL);
  assert.equal(q.type, 'kanji-to-meaning', 'Should fallback to meaning-based question');
  assert.equal(q.choices.length, 4);
}

// --- createTestSession ---

function testCreateTestSessionEmptyDue(): void {
  const state = createTestSession([], { N3: POOL });
  assert.equal(state.questions.length, 0);
  assert.equal(state.phase, 'intro');
}

function testCreateTestSessionCapsAt20(): void {
  const state = createTestSession(POOL, { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  assert.ok(state.questions.length <= 20, 'Should cap at 20 questions');
  assert.equal(state.questions.length, Math.min(POOL.length, 20));
  assert.equal(state.phase, 'intro');
}

function testCreateTestSessionSmallPool(): void {
  const small = POOL.slice(0, 5);
  const state = createTestSession(small, { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  assert.equal(state.questions.length, 5);
  for (const q of state.questions) {
    assert.equal(q.choices.length, 4, 'Each question should have 4 choices');
  }
}

// --- answerQuestion + nextQuestion ---

function testAnswerAndNextQuestion(): void {
  let state = createTestSession(POOL, { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  const correctIdx = state.questions[0].correctIndex;
  state = answerQuestion(state, correctIdx);
  assert.equal(state.answers.length, 1);
  assert.equal(state.answers[0].correct, true);

  state = nextQuestion(state);
  assert.equal(state.currentQuestionIndex, 1);
  assert.equal(state.phase, 'question');
}

function testAnswerWrongQuestion(): void {
  let state = createTestSession(POOL, { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  const wrongIdx = (state.questions[0].correctIndex + 1) % 4;
  state = answerQuestion(state, wrongIdx);
  assert.equal(state.answers[0].correct, false);
}

function testDoubleAnswerIgnored(): void {
  let state = createTestSession(POOL, { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  state = answerQuestion(state, 0);
  state = answerQuestion(state, 1);
  assert.equal(state.answers.length, 1, 'Should not allow double answer');
}

function testLastQuestionGoesToResults(): void {
  let state = createTestSession(POOL.slice(0, 4), { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  for (let i = 0; i < state.questions.length; i++) {
    state = answerQuestion(state, state.questions[i].correctIndex);
    state = nextQuestion(state);
  }

  assert.equal(state.phase, 'results');
}

// --- computeScore ---

function testComputeScore(): void {
  let state = createTestSession(POOL.slice(0, 4), { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  // Answer first 2 correctly, last 2 wrong
  for (let i = 0; i < state.questions.length; i++) {
    const idx = i < 2 ? state.questions[i].correctIndex : (state.questions[i].correctIndex + 1) % 4;
    state = answerQuestion(state, idx);
    state = nextQuestion(state);
  }

  const score = computeScore(state);
  assert.equal(score.correct, 2);
  assert.equal(score.total, 4);
  assert.equal(score.percentage, 50);
}

function testComputeScoreEmpty(): void {
  const state: import('../src/types.js').TestState = {
    phase: 'results',
    questions: [],
    answers: [],
    currentQuestionIndex: 0,
    testedKanjiIds: []
  };
  const score = computeScore(state);
  assert.equal(score.correct, 0);
  assert.equal(score.total, 0);
  assert.equal(score.percentage, 0);
}

// --- getWrongAnswers ---

function testGetWrongAnswers(): void {
  let state = createTestSession(POOL.slice(0, 4), { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  // First correct, rest wrong
  state = answerQuestion(state, state.questions[0].correctIndex);
  state = nextQuestion(state);
  for (let i = 1; i < state.questions.length; i++) {
    state = answerQuestion(state, (state.questions[i].correctIndex + 1) % 4);
    state = nextQuestion(state);
  }

  const wrong = getWrongAnswers(state);
  assert.equal(wrong.length, 3);
}

// --- testResultsToSrsGrades ---

function testSrsGradesAllCorrect(): void {
  let state = createTestSession(POOL.slice(0, 4), { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  for (let i = 0; i < state.questions.length; i++) {
    state = answerQuestion(state, state.questions[i].correctIndex);
    state = nextQuestion(state);
  }

  const grades = testResultsToSrsGrades(state);
  for (const id of state.testedKanjiIds) {
    if (grades[id] !== undefined) {
      assert.equal(grades[id], 'good', `${id} should be 'good'`);
    }
  }
}

function testSrsGradesWrongOverridesGood(): void {
  let state = createTestSession(POOL.slice(0, 4), { N3: POOL.filter((k) => k.level === 'N3'), N2: POOL.filter((k) => k.level === 'N2') });
  state = { ...state, phase: 'question' };

  // Answer first wrong, rest correct
  state = answerQuestion(state, (state.questions[0].correctIndex + 1) % 4);
  state = nextQuestion(state);
  for (let i = 1; i < state.questions.length; i++) {
    state = answerQuestion(state, state.questions[i].correctIndex);
    state = nextQuestion(state);
  }

  const grades = testResultsToSrsGrades(state);
  const wrongKanjiId = state.questions[0].kanjiId;
  assert.equal(grades[wrongKanjiId], 'again');
}

const tests: Array<[string, () => void]> = [
  ['getDueKanji: all new are due', testGetDueKanjiAllNewAreDue],
  ['getDueKanji: filters not-due', testGetDueKanjiFiltersNotDue],
  ['getDueKanji: includes past-due', testGetDueKanjiIncludesPastDue],
  ['pickDistractors: excludes target', testPickDistractorsExcludesTarget],
  ['pickDistractors: handles small pool', testPickDistractorsHandlesSmallPool],
  ['generateQuestion: kanji-to-meaning', testGenerateKanjiToMeaning],
  ['generateQuestion: meaning-to-kanji', testGenerateMeaningToKanji],
  ['generateQuestion: kanji-to-reading', testGenerateKanjiToReading],
  ['generateQuestion: reading-to-kanji', testGenerateReadingToKanji],
  ['generateQuestion: no readings fallback', testGenerateQuestionNoReadings],
  ['createTestSession: empty due', testCreateTestSessionEmptyDue],
  ['createTestSession: caps at 20', testCreateTestSessionCapsAt20],
  ['createTestSession: small pool', testCreateTestSessionSmallPool],
  ['answerQuestion + nextQuestion', testAnswerAndNextQuestion],
  ['answerQuestion: wrong answer', testAnswerWrongQuestion],
  ['answerQuestion: double answer ignored', testDoubleAnswerIgnored],
  ['last question goes to results', testLastQuestionGoesToResults],
  ['computeScore', testComputeScore],
  ['computeScore: empty', testComputeScoreEmpty],
  ['getWrongAnswers', testGetWrongAnswers],
  ['testResultsToSrsGrades: all correct', testSrsGradesAllCorrect],
  ['testResultsToSrsGrades: wrong overrides good', testSrsGradesWrongOverridesGood],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ${name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`\nAll ${tests.length} tests passed.`);
}
