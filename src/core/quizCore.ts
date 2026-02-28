import type { Kanji, QuizState } from '../types.js';

const DEFAULT_LEVELS = ['N3'];
const LEVEL_VALUES = ['N5', 'N4', 'N3', 'N2', 'N5-N3', 'ALL'];

export function filterByLevels(allKanji: Kanji[], levels: string[]): Kanji[] {
  if (!Array.isArray(allKanji)) return [];
  const normalized = levels && levels.length ? levels : DEFAULT_LEVELS;
  const levelSet = new Set(normalized);
  return allKanji.filter((k) => levelSet.has(k.level));
}

export function normalizeLevelPreference(
  rawValue: unknown,
  fallback: string = DEFAULT_LEVELS[0]
): string {
  if (typeof rawValue !== 'string' || rawValue.length === 0) return fallback;
  if (!LEVEL_VALUES.includes(rawValue)) return fallback;
  return rawValue;
}

export function createSession(allKanji: Kanji[], options: { levels?: string[] } = {}): QuizState {
  const levels = options.levels && options.levels.length ? options.levels : DEFAULT_LEVELS;
  const pool = filterByLevels(allKanji, levels);
  const startIndex = pool.length ? Math.floor(Math.random() * pool.length) : -1;

  return {
    pool,
    currentIndex: startIndex,
    revealed: false,
    stats: {
      seen: 0,
      known: 0,
      unknown: 0
    },
    history: [],
    filter: {
      levels
    }
  };
}

export function setLevels(state: QuizState, allKanji: Kanji[], levels: string[]): QuizState {
  const normalized = levels && levels.length ? levels : DEFAULT_LEVELS;
  const pool = filterByLevels(allKanji, normalized);
  const base = createSession(allKanji, { levels: normalized });
  return {
    ...base,
    pool,
    stats: state.stats,
    history: state.history
  };
}

export function toggleReveal(state: QuizState): QuizState {
  return {
    ...state,
    revealed: !state.revealed
  };
}

export function reveal(state: QuizState): QuizState {
  if (state.revealed) return state;
  return {
    ...state,
    revealed: true
  };
}

export function hide(state: QuizState): QuizState {
  if (!state.revealed) return state;
  return {
    ...state,
    revealed: false
  };
}

function nextIndex(pool: Kanji[], currentIndex: number): number {
  if (!pool.length) return -1;
  if (pool.length === 1) return 0;
  let candidate = currentIndex;
  const maxTries = 10;
  let tries = 0;
  while (candidate === currentIndex && tries < maxTries) {
    candidate = Math.floor(Math.random() * pool.length);
    tries += 1;
  }
  return candidate;
}

function recordResult(state: QuizState, kind: 'known' | 'unknown'): QuizState {
  if (!state.pool.length || state.currentIndex < 0) return state;
  const current = state.pool[state.currentIndex];

  return {
    ...state,
    revealed: false,
    stats: {
      seen: state.stats.seen + 1,
      known: state.stats.known + (kind === 'known' ? 1 : 0),
      unknown: state.stats.unknown + (kind === 'unknown' ? 1 : 0)
    },
    history: [
      ...state.history,
      {
        id: current.id,
        level: current.level,
        result: kind
      }
    ]
  };
}

export function markKnown(state: QuizState): QuizState {
  return recordResult(state, 'known');
}

export function markUnknown(state: QuizState): QuizState {
  return recordResult(state, 'unknown');
}

export function advance(state: QuizState): QuizState {
  if (!state.pool.length || state.currentIndex < 0) return state;
  const next = nextIndex(state.pool, state.currentIndex);
  return {
    ...state,
    currentIndex: next,
    revealed: false
  };
}

export function getAccuracy(state: QuizState): number {
  const { seen, known } = state.stats;
  if (!seen) return 0;
  return (known / seen) * 100;
}
