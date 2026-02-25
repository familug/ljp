const DEFAULT_LEVELS = ['N3'];

export function filterByLevels(allKanji, levels) {
  if (!Array.isArray(allKanji)) return [];
  const normalized = levels && levels.length ? levels : DEFAULT_LEVELS;
  const levelSet = new Set(normalized);
  return allKanji.filter((k) => levelSet.has(k.level));
}

export function createSession(allKanji, options = {}) {
  const levels = options.levels && options.levels.length ? options.levels : DEFAULT_LEVELS;
  const pool = filterByLevels(allKanji, levels);

  return {
    pool,
    currentIndex: pool.length ? 0 : -1,
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

export function setLevels(state, allKanji, levels) {
  const normalized = levels && levels.length ? levels : DEFAULT_LEVELS;
  const pool = filterByLevels(allKanji, normalized);
  const base = createSession(allKanji, { levels: normalized });
  return {
    ...base,
    pool
  };
}

export function toggleReveal(state) {
  return {
    ...state,
    revealed: !state.revealed
  };
}

export function reveal(state) {
  if (state.revealed) return state;
  return {
    ...state,
    revealed: true
  };
}

export function hide(state) {
  if (!state.revealed) return state;
  return {
    ...state,
    revealed: false
  };
}

function nextIndex(pool, currentIndex) {
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

function recordResult(state, kind) {
  if (!state.pool.length || state.currentIndex < 0) return state;
  const current = state.pool[state.currentIndex];
  const next = nextIndex(state.pool, state.currentIndex);

  return {
    ...state,
    currentIndex: next,
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

export function markKnown(state) {
  return recordResult(state, 'known');
}

export function markUnknown(state) {
  return recordResult(state, 'unknown');
}

export function advance(state) {
  if (!state.pool.length || state.currentIndex < 0) return state;
  const next = nextIndex(state.pool, state.currentIndex);
  return {
    ...state,
    currentIndex: next,
    revealed: false
  };
}

export function getAccuracy(state) {
  const { seen, known } = state.stats;
  if (!seen) return 0;
  return (known / seen) * 100;
}

