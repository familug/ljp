import {
  createSession,
  setLevels,
  toggleReveal,
  markKnown,
  markUnknown,
  advance,
  getAccuracy
} from '../core/quizCore.js';
import { createInitialSrsState, updateSrsState, normalizeSrsState } from '../core/srs.js';

const PROGRESS_KEY = 'jlpt-kanji-progress-v1';

function createTtsApi(win) {
  if (!win || !('speechSynthesis' in win)) {
    return {
      available: false,
      speakKanji: () => {},
      speakExample: () => {}
    };
  }

  const synth = win.speechSynthesis;

  function pickJapaneseVoice() {
    const voices = synth.getVoices();
    if (!voices || !voices.length) return null;
    const ja = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
    return ja || voices[0];
  }

  function speak(text) {
    if (!text) return;
    const utterance = new win.SpeechSynthesisUtterance(text);
    const voice = pickJapaneseVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = (voice && voice.lang) || 'ja-JP';
    synth.cancel();
    synth.speak(utterance);
  }

  return {
    available: true,
    speakKanji(kanji) {
      if (!kanji) return;
      const primaryReading =
        (kanji.kunyomi && kanji.kunyomi[0]) ||
        (kanji.onyomi && kanji.onyomi[0]) ||
        kanji.kanji;
      speak(primaryReading);
    },
    speakExample(kanji) {
      if (!kanji || !kanji.example) return;
      speak(kanji.example.sentence || kanji.example.reading);
    }
  };
}

function levelsFromSelectValue(value) {
  if (value === 'N5') return ['N5'];
  if (value === 'N4') return ['N4'];
  if (value === 'N3') return ['N3'];
  if (value === 'N2') return ['N2'];
  if (value === 'N5-N3') return ['N5', 'N4', 'N3'];
  if (value === 'ALL') return ['N5', 'N4', 'N3', 'N2'];
  return ['N3'];
}

function initTheme(win, doc, toggleButton) {
  const root = doc.documentElement;
  const storageKey = 'kanji-trainer-theme';

  function getSystemPrefersDark() {
    return win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function readStoredTheme() {
    try {
      const value = win.localStorage.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  function writeStoredTheme(theme) {
    try {
      win.localStorage.setItem(storageKey, theme);
    } catch {
      // ignore
    }
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (toggleButton) {
      toggleButton.textContent = theme === 'dark' ? '🌙' : '☀️';
      toggleButton.setAttribute(
        'aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      );
    }
  }

  const stored = readStoredTheme();
  const initial = stored || (getSystemPrefersDark() ? 'dark' : 'light');
  applyTheme(initial);

  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      writeStoredTheme(next);
    });
  }
}

export function bootstrapKanjiApp(allKanji, win = window, doc = document) {
  const tts = createTtsApi(win);

  const levelSelect = doc.getElementById('level-select');
  const themeToggle = doc.getElementById('theme-toggle');

  const cardLevel = doc.getElementById('card-level');
  const cardIndex = doc.getElementById('card-index');
  const cardKanji = doc.getElementById('card-kanji');
  const cardReadings = doc.getElementById('card-readings');
  const cardMeanings = doc.getElementById('card-meanings');
  const cardExampleSentence = doc.getElementById('card-example-sentence');
  const cardExampleReading = doc.getElementById('card-example-reading');
  const cardExampleTranslation = doc.getElementById('card-example-translation');

  const statsSeen = doc.getElementById('stats-seen');
  const statsKnown = doc.getElementById('stats-known');

  const toggleReadingsBtn = doc.getElementById('toggle-readings');
  const markKnownBtn = doc.getElementById('mark-known');
  const markUnknownBtn = doc.getElementById('mark-unknown');
  const nextCardBtn = doc.getElementById('next-card');
  const speakKanjiBtn = doc.getElementById('speak-kanji');
  const speakExampleBtn = doc.getElementById('speak-example');

  initTheme(win, doc, themeToggle);

  const initialLevels = levelsFromSelectValue(levelSelect ? levelSelect.value : 'N3');
  let state = createSession(allKanji, { levels: initialLevels });
  let perKanjiProgress = {};

  function loadPersistedProgress() {
    try {
      const raw = win.localStorage.getItem(PROGRESS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function savePersistedProgress() {
    try {
      const payload = {
        stats: state.stats,
        perKanji: perKanjiProgress
      };
      win.localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  function getCurrentKanji(currentState) {
    const { pool, currentIndex } = currentState;
    if (!pool.length || currentIndex < 0) return null;
    return pool[currentIndex];
  }

  function pickNextIndex(currentState, nowMs = Date.now()) {
    const { pool } = currentState;
    if (!pool.length) return -1;
    const now = nowMs;
    const DAY_MS = 24 * 60 * 60 * 1000;

    const cards = pool.map((k, index) => {
      const entry = perKanjiProgress[k.id] || {};
      const normalized = normalizeSrsState(entry, now);
      return {
        index,
        dueMs: normalized.due
      };
    });

    const due = cards.filter((c) => !c.dueMs || c.dueMs <= now);
    const source = due.length ? due : cards;
    const minDue = Math.min(...source.map((c) => c.dueMs || now));
    const windowLimit = minDue + DAY_MS;
    const windowCards = source.filter((c) => (c.dueMs || now) <= windowLimit);
    const chosen = windowCards[Math.floor(Math.random() * windowCards.length)];
    return chosen.index;
  }

  const persisted = loadPersistedProgress();
  if (persisted && persisted.stats) {
    state = {
      ...state,
      stats: {
        seen: persisted.stats.seen || 0,
        known: persisted.stats.known || 0,
        unknown: persisted.stats.unknown || 0
      }
    };
    if (persisted.perKanji && typeof persisted.perKanji === 'object') {
      perKanjiProgress = persisted.perKanji;
    }
  }

  function render(currentState) {
    const { pool, currentIndex } = currentState;

    const hasKanji = pool.length > 0 && currentIndex >= 0;
    toggleReadingsBtn.disabled = !hasKanji;
    markKnownBtn.disabled = !hasKanji;
    markUnknownBtn.disabled = !hasKanji;
    nextCardBtn.disabled = !hasKanji;

    if (!tts.available) {
      speakKanjiBtn.disabled = true;
      speakExampleBtn.disabled = true;
      speakKanjiBtn.title = 'Text-to-speech is not available in this browser.';
      speakExampleBtn.title = 'Text-to-speech is not available in this browser.';
    } else {
      speakKanjiBtn.disabled = !hasKanji;
      speakExampleBtn.disabled = !hasKanji;
    }

    if (!hasKanji) {
      cardLevel.textContent = 'NO DATA';
      cardIndex.textContent = '';
      cardKanji.textContent = '—';
      cardReadings.textContent = 'No kanji available for this selection.';
      cardMeanings.textContent = '';
      cardExampleSentence.textContent = '';
      cardExampleReading.textContent = '';
      cardExampleTranslation.textContent = '';
      statsSeen.textContent = 'Seen: 0';
      statsKnown.textContent = 'Known: 0 (0%)';
      cardReadings.classList.add('card__section-content--visible');
      cardReadings.classList.remove('card__section-content--hidden');
      toggleReadingsBtn.textContent = 'Reveal';
      return;
    }

    const kanji = pool[currentIndex];
    const indexLabel = `${currentIndex + 1} / ${pool.length}`;
    cardLevel.textContent = kanji.level || '';
    cardIndex.textContent = indexLabel;
    cardKanji.textContent = kanji.kanji || '';

    const readingsPieces = [];
    if (kanji.onyomi && kanji.onyomi.length) {
      readingsPieces.push(`音: ${kanji.onyomi.join('、 ')}`);
    }
    if (kanji.kunyomi && kanji.kunyomi.length) {
      readingsPieces.push(`訓: ${kanji.kunyomi.join('、 ')}`);
    }
    cardReadings.textContent = readingsPieces.join('　');

    cardMeanings.textContent = (kanji.meanings || []).join(', ');

    if (kanji.example) {
      cardExampleSentence.textContent = kanji.example.sentence || '';
      cardExampleReading.textContent = kanji.example.reading || '';
      cardExampleTranslation.textContent = kanji.example.translation || '';
    } else {
      cardExampleSentence.textContent = '';
      cardExampleReading.textContent = '';
      cardExampleTranslation.textContent = '';
    }

    if (currentState.revealed) {
      cardReadings.classList.add('card__section-content--visible');
      cardReadings.classList.remove('card__section-content--hidden');
      toggleReadingsBtn.textContent = 'Hide';
    } else {
      cardReadings.classList.add('card__section-content--hidden');
      cardReadings.classList.remove('card__section-content--visible');
      toggleReadingsBtn.textContent = 'Reveal';
    }

    const accuracy = getAccuracy(currentState);
    statsSeen.textContent = `Seen: ${currentState.stats.seen}`;
    statsKnown.textContent = `Known: ${currentState.stats.known} (${accuracy.toFixed(0)}%)`;
  }

  if (levelSelect) {
    levelSelect.addEventListener('change', () => {
      const levels = levelsFromSelectValue(levelSelect.value);
      state = setLevels(state, allKanji, levels);
      render(state);
    });
  }

  if (toggleReadingsBtn) {
    toggleReadingsBtn.addEventListener('click', () => {
      state = toggleReveal(state);
      render(state);
    });
  }

  if (markKnownBtn) {
    markKnownBtn.addEventListener('click', () => {
      const answered = getCurrentKanji(state);
      const now = Date.now();
      state = markKnown(state);
      if (answered && answered.id) {
        const prev = perKanjiProgress[answered.id] || {
          seen: 0,
          known: 0,
          unknown: 0,
          lastResult: null
        };
        const srsPrev = {
          interval: prev.interval,
          repetitions: prev.repetitions,
          ease: prev.ease,
          due: prev.due,
          lastReviewed: prev.lastReviewed
        };
        const srsNext = updateSrsState(srsPrev, 'good', now);
        perKanjiProgress = {
          ...perKanjiProgress,
          [answered.id]: {
            seen: prev.seen + 1,
            known: prev.known + 1,
            unknown: prev.unknown,
            lastResult: 'known',
            ...srsNext
          }
        };
      }
      savePersistedProgress();
      const nextIdx = pickNextIndex(state, now);
      if (nextIdx >= 0) {
        state = {
          ...state,
          currentIndex: nextIdx
        };
      }
      render(state);
    });
  }

  if (markUnknownBtn) {
    markUnknownBtn.addEventListener('click', () => {
      const answered = getCurrentKanji(state);
      const now = Date.now();
      state = markUnknown(state);
      if (answered && answered.id) {
        const prev = perKanjiProgress[answered.id] || {
          seen: 0,
          known: 0,
          unknown: 0,
          lastResult: null
        };
        const srsPrev = {
          interval: prev.interval,
          repetitions: prev.repetitions,
          ease: prev.ease,
          due: prev.due,
          lastReviewed: prev.lastReviewed
        };
        const srsNext = updateSrsState(srsPrev, 'again', now);
        perKanjiProgress = {
          ...perKanjiProgress,
          [answered.id]: {
            seen: prev.seen + 1,
            known: prev.known,
            unknown: prev.unknown + 1,
            lastResult: 'unknown',
            ...srsNext
          }
        };
      }
      savePersistedProgress();
      const nextIdx = pickNextIndex(state, now);
      if (nextIdx >= 0) {
        state = {
          ...state,
          currentIndex: nextIdx
        };
      }
      render(state);
    });
  }

  if (nextCardBtn) {
    nextCardBtn.addEventListener('click', () => {
      const now = Date.now();
      const nextIdx = pickNextIndex(state, now);
      if (nextIdx >= 0) {
        state = {
          ...state,
          currentIndex: nextIdx,
          revealed: false
        };
      }
      render(state);
    });
  }

  if (speakKanjiBtn && tts.available) {
    speakKanjiBtn.addEventListener('click', () => {
      const { pool, currentIndex } = state;
      if (!pool.length || currentIndex < 0) return;
      tts.speakKanji(pool[currentIndex]);
    });
  }

  if (speakExampleBtn && tts.available) {
    speakExampleBtn.addEventListener('click', () => {
      const { pool, currentIndex } = state;
      if (!pool.length || currentIndex < 0) return;
      tts.speakExample(pool[currentIndex]);
    });
  }

  render(state);
}

