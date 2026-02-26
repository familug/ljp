const DAY_MS = 24 * 60 * 60 * 1000;

export function createInitialSrsState(nowMs = Date.now()) {
  return {
    interval: 0,
    repetitions: 0,
    ease: 2.5,
    due: nowMs,
    lastReviewed: null
  };
}

export function normalizeSrsState(raw, nowMs = Date.now()) {
  if (!raw) return createInitialSrsState(nowMs);
  return {
    interval: typeof raw.interval === 'number' && raw.interval >= 0 ? raw.interval : 0,
    repetitions: typeof raw.repetitions === 'number' && raw.repetitions >= 0 ? raw.repetitions : 0,
    ease: typeof raw.ease === 'number' && raw.ease > 0 ? raw.ease : 2.5,
    due: typeof raw.due === 'number' && raw.due > 0 ? raw.due : nowMs,
    lastReviewed:
      typeof raw.lastReviewed === 'number' && raw.lastReviewed > 0 ? raw.lastReviewed : null
  };
}

export function updateSrsState(prevRaw, grade, nowMs = Date.now()) {
  const prev = normalizeSrsState(prevRaw, nowMs);
  let { interval, repetitions, ease } = prev;

  if (grade === 'again') {
    repetitions = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else if (grade === 'good') {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    repetitions += 1;
    ease += 0.05;
  }

  const due = nowMs + interval * DAY_MS;

  return {
    interval,
    repetitions,
    ease,
    due,
    lastReviewed: nowMs
  };
}

