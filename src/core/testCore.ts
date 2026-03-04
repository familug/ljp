import type {
  Kanji,
  SrsState,
  TestQuestionType,
  TestQuestion,
  TestAnswer,
  TestState
} from '../types.js';
import { normalizeSrsState } from './srs.js';

const QUESTIONS_PER_SESSION = 40;
const CHOICES_PER_QUESTION = 4;

const QUESTION_TYPES: TestQuestionType[] = [
  'kanji-to-meaning',
  'meaning-to-kanji',
  'kanji-to-reading',
  'reading-to-kanji'
];

export function getDueKanji(
  allKanji: Kanji[],
  perKanji: Record<string, Record<string, unknown>>,
  nowMs: number
): Kanji[] {
  return allKanji.filter((k) => {
    const entry = perKanji[k.id];
    if (!entry) return true;
    const srs = normalizeSrsState(entry as Partial<SrsState>, nowMs);
    return srs.due <= nowMs;
  });
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getReadings(k: Kanji): string[] {
  const readings: string[] = [];
  if (k.onyomi?.length) readings.push(...k.onyomi);
  if (k.kunyomi?.length) readings.push(...k.kunyomi);
  return readings;
}

function getPrimaryReading(k: Kanji): string {
  if (k.kunyomi?.length) return k.kunyomi[0];
  if (k.onyomi?.length) return k.onyomi[0];
  return k.kanji;
}

function getPrimaryMeaning(k: Kanji): string {
  return k.meanings?.[0] ?? k.kanji;
}

function hasReadings(k: Kanji): boolean {
  return getReadings(k).length > 0;
}

export function pickDistractors(
  pool: Kanji[],
  excludeId: string,
  count: number
): Kanji[] {
  const candidates = pool.filter((k) => k.id !== excludeId);
  const shuffled = shuffle(candidates);
  return shuffled.slice(0, count);
}

function canGenerateType(type: TestQuestionType, target: Kanji, pool: Kanji[]): boolean {
  if (type === 'kanji-to-reading' || type === 'reading-to-kanji') {
    if (!hasReadings(target)) return false;
    const othersWithReadings = pool.filter((k) => k.id !== target.id && hasReadings(k));
    if (othersWithReadings.length < CHOICES_PER_QUESTION - 1) return false;
  }
  if (type === 'kanji-to-meaning' || type === 'meaning-to-kanji') {
    const othersWithMeanings = pool.filter(
      (k) => k.id !== target.id && k.meanings?.length > 0
    );
    if (othersWithMeanings.length < CHOICES_PER_QUESTION - 1) return false;
  }
  return true;
}

function pickValidType(target: Kanji, pool: Kanji[], allowedTypes?: TestQuestionType[]): TestQuestionType {
  const types = allowedTypes && allowedTypes.length ? allowedTypes : QUESTION_TYPES;
  const shuffled = shuffle(types.slice());
  for (const t of shuffled) {
    if (canGenerateType(t, target, pool)) return t;
  }
  return types[0];
}

export function generateQuestion(
  type: TestQuestionType,
  target: Kanji,
  levelPool: Kanji[]
): TestQuestion {
  let distractorPool: Kanji[];
  if (type === 'kanji-to-reading' || type === 'reading-to-kanji') {
    distractorPool = levelPool.filter((k) => k.id !== target.id && hasReadings(k));
  } else {
    distractorPool = levelPool.filter(
      (k) => k.id !== target.id && k.meanings?.length > 0
    );
  }

  const distractors = pickDistractors(distractorPool, target.id, CHOICES_PER_QUESTION - 1);

  let prompt: string;
  let correctChoice: string;
  let distractorChoices: string[];

  switch (type) {
    case 'kanji-to-meaning':
      prompt = target.kanji;
      correctChoice = getPrimaryMeaning(target);
      distractorChoices = distractors.map(getPrimaryMeaning);
      break;
    case 'meaning-to-kanji':
      prompt = getPrimaryMeaning(target);
      correctChoice = target.kanji;
      distractorChoices = distractors.map((k) => k.kanji);
      break;
    case 'kanji-to-reading':
      prompt = target.kanji;
      correctChoice = getPrimaryReading(target);
      distractorChoices = distractors.map(getPrimaryReading);
      break;
    case 'reading-to-kanji':
      prompt = getPrimaryReading(target);
      correctChoice = target.kanji;
      distractorChoices = distractors.map((k) => k.kanji);
      break;
  }

  // Deduplicate: if a distractor matches the correct choice, skip it
  const uniqueDistractors = distractorChoices.filter((c) => c !== correctChoice);
  const finalDistractors = uniqueDistractors.slice(0, CHOICES_PER_QUESTION - 1);

  // Pad with remaining distractors if we lost some to deduplication
  if (finalDistractors.length < CHOICES_PER_QUESTION - 1) {
    const extraPool = levelPool.filter(
      (k) =>
        k.id !== target.id &&
        !distractors.some((d) => d.id === k.id)
    );
    const shuffledExtra = shuffle(extraPool);
    for (const extra of shuffledExtra) {
      if (finalDistractors.length >= CHOICES_PER_QUESTION - 1) break;
      let choice: string;
      if (type === 'kanji-to-reading' || type === 'reading-to-kanji') {
        if (!hasReadings(extra)) continue;
        choice = type === 'kanji-to-reading' ? getPrimaryReading(extra) : extra.kanji;
      } else {
        choice = type === 'kanji-to-meaning' ? getPrimaryMeaning(extra) : extra.kanji;
      }
      if (choice !== correctChoice && !finalDistractors.includes(choice)) {
        finalDistractors.push(choice);
      }
    }
  }

  const allChoices = [correctChoice, ...finalDistractors];
  const shuffledChoices = shuffle(allChoices);
  const correctIndex = shuffledChoices.indexOf(correctChoice);

  return {
    type,
    kanjiId: target.id,
    prompt,
    choices: shuffledChoices,
    correctIndex
  };
}

export function createTestSession(
  dueKanji: Kanji[],
  allKanjiByLevel: Record<string, Kanji[]>,
  allowedTypes?: TestQuestionType[]
): TestState {
  if (dueKanji.length === 0) {
    return {
      phase: 'intro',
      questions: [],
      answers: [],
      currentQuestionIndex: 0,
      testedKanjiIds: []
    };
  }

  const shuffled = shuffle(dueKanji);
  const selected = shuffled.slice(0, QUESTIONS_PER_SESSION);
  const allPool = Object.values(allKanjiByLevel).flat();

  const questions: TestQuestion[] = selected.map((target) => {
    const levelPool = allKanjiByLevel[target.level] ?? allPool;
    const pool = levelPool.length >= CHOICES_PER_QUESTION ? levelPool : allPool;
    const type = pickValidType(target, pool, allowedTypes);
    return generateQuestion(type, target, pool);
  });

  return {
    phase: 'intro',
    questions,
    answers: [],
    currentQuestionIndex: 0,
    testedKanjiIds: selected.map((k) => k.id)
  };
}

export function answerQuestion(state: TestState, chosenIndex: number): TestState {
  if (state.phase !== 'question') return state;
  if (state.currentQuestionIndex >= state.questions.length) return state;
  if (state.answers.length > state.currentQuestionIndex) return state;

  const question = state.questions[state.currentQuestionIndex];
  const correct = chosenIndex === question.correctIndex;
  const answer: TestAnswer = {
    questionIndex: state.currentQuestionIndex,
    chosenIndex,
    correct
  };

  return {
    ...state,
    answers: [...state.answers, answer]
  };
}

export function nextQuestion(state: TestState): TestState {
  if (state.phase !== 'question') return state;
  if (state.answers.length <= state.currentQuestionIndex) return state;

  const nextIdx = state.currentQuestionIndex + 1;
  if (nextIdx >= state.questions.length) {
    return { ...state, phase: 'results' };
  }

  return { ...state, currentQuestionIndex: nextIdx };
}

export function computeScore(state: TestState): {
  correct: number;
  total: number;
  percentage: number;
} {
  const total = state.answers.length;
  const correct = state.answers.filter((a) => a.correct).length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percentage };
}

export function getWrongAnswers(
  state: TestState
): Array<{ question: TestQuestion; answer: TestAnswer }> {
  return state.answers
    .filter((a) => !a.correct)
    .map((a) => ({
      question: state.questions[a.questionIndex],
      answer: a
    }));
}

export function testResultsToSrsGrades(
  state: TestState
): Record<string, 'good' | 'again'> {
  const grades: Record<string, 'good' | 'again'> = {};

  for (const answer of state.answers) {
    const question = state.questions[answer.questionIndex];
    const kanjiId = question.kanjiId;

    if (!answer.correct) {
      grades[kanjiId] = 'again';
    } else if (grades[kanjiId] !== 'again') {
      grades[kanjiId] = 'good';
    }
  }

  return grades;
}
