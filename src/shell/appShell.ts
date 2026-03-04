import type { Kanji, QuizState } from '../types.js';
import {
  createSession,
  setLevels,
  markKnown,
  markUnknown,
  getAccuracy,
  normalizeLevelPreference
} from '../core/quizCore.js';
import { updateSrsState, normalizeSrsState } from '../core/srs.js';
import { scoreStroke } from '../core/strokeScore.js';
import type { LanguageConfig } from '../core/language.js';
import { storageKey as langStorageKey, LANGUAGES, nextLanguage, setStoredLanguage } from '../core/language.js';

const DEFAULT_DAILY_GOAL = 40;

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function readDailyGoal(win: Window, langConfig?: LanguageConfig): number {
  const key = langConfig ? langStorageKey(langConfig, 'daily-goal-v1') : 'jlpt-daily-goal-v1';
  try {
    const raw = win.localStorage.getItem(key);
    if (raw == null) return DEFAULT_DAILY_GOAL;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : DEFAULT_DAILY_GOAL;
  } catch {
    return DEFAULT_DAILY_GOAL;
  }
}

export function writeDailyGoal(win: Window, goal: number, langConfig?: LanguageConfig): void {
  const key = langConfig ? langStorageKey(langConfig, 'daily-goal-v1') : 'jlpt-daily-goal-v1';
  try {
    const n = Math.max(1, Math.min(1000, Math.floor(goal)));
    win.localStorage.setItem(key, String(n));
  } catch {
    // ignore
  }
}

function getDailyKnownCount(win: Window, langConfig?: LanguageConfig): number {
  const key = langConfig ? langStorageKey(langConfig, 'daily-known-v1') : 'jlpt-daily-known-v1';
  try {
    const raw = win.localStorage.getItem(key);
    if (!raw) return 0;
    const data = JSON.parse(raw) as { date?: string; count?: number };
    const today = getTodayString();
    if (data.date !== today) return 0;
    const c = typeof data.count === 'number' ? data.count : 0;
    return c >= 0 ? c : 0;
  } catch {
    return 0;
  }
}

function incrementDailyKnown(win: Window, langConfig?: LanguageConfig): void {
  const key = langConfig ? langStorageKey(langConfig, 'daily-known-v1') : 'jlpt-daily-known-v1';
  try {
    const today = getTodayString();
    const raw = win.localStorage.getItem(key);
    let count = 1;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { date?: string; count?: number };
        if (parsed.date === today && typeof parsed.count === 'number' && parsed.count >= 0) {
          count = parsed.count + 1;
        }
      } catch {
        // use 1
      }
    }
    win.localStorage.setItem(key, JSON.stringify({ date: today, count }));
  } catch {
    // ignore
  }
}

export function createTtsApi(win: Window, langConfig?: LanguageConfig) {
  if (!win || !('speechSynthesis' in win)) {
    return {
      available: false,
      speakKanji: () => {},
      speakExample: () => {},
      speakExampleTranslation: () => {}
    };
  }

  const synth = win.speechSynthesis;
  const ttsLang = langConfig?.ttsLang ?? 'ja';

  function pickVoice(langPrefix: string) {
    const voices = synth.getVoices();
    if (!voices || !voices.length) return null;
    const match = voices.find((v: SpeechSynthesisVoice) => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
    return match || voices[0];
  }

  function speakWithLang(text: string, langPrefix: string, fallbackLang: string) {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(langPrefix);
    if (voice) utterance.voice = voice;
    utterance.lang = (voice && voice.lang) || fallbackLang;
    synth.cancel();
    synth.speak(utterance);
  }

  function speakTarget(text: string) {
    const fallback = ttsLang === 'fr' ? 'fr-FR' : 'ja-JP';
    speakWithLang(text, ttsLang, fallback);
  }

  function speakEnglish(text: string) {
    speakWithLang(text, 'en', 'en-US');
  }

  const isFrench = ttsLang === 'fr';

  return {
    available: true,
    speakKanji(kanji: Kanji) {
      if (!kanji) return;
      if (isFrench) {
        // For French, speak the word itself
        speakTarget(kanji.kanji);
      } else {
        // For Japanese, speak the primary reading
        const primaryReading =
          (kanji.kunyomi && kanji.kunyomi[0]) ||
          (kanji.onyomi && kanji.onyomi[0]) ||
          kanji.kanji;
        speakTarget(primaryReading);
      }
    },
    speakExample(kanji: Kanji) {
      if (!kanji || !kanji.example) return;
      if (isFrench) {
        speakTarget(kanji.example.sentence);
      } else {
        speakTarget(kanji.example.sentence || kanji.example.reading);
      }
    },
    speakExampleTranslation(kanji: Kanji) {
      if (!kanji || !kanji.example) return;
      speakEnglish(kanji.example.translation || '');
    }
  };
}

export function levelsFromSelectValue(value: string, langConfig?: LanguageConfig): string[] {
  const levels = langConfig?.levels ?? LANGUAGES.ja.levels;
  // Single level
  if (levels.includes(value)) return [value];
  // Combined values
  if (value === 'N5-N3') return ['N5', 'N4', 'N3'];
  if (value === 'ALL') return levels.slice();
  // Default to first level
  return [langConfig?.defaultLevel ?? levels[0]];
}

export function initTheme(
  win: Window,
  doc: Document,
  toggleButton: HTMLElement | null
): void {
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

  function writeStoredTheme(theme: string): void {
    try {
      win.localStorage.setItem(storageKey, theme);
    } catch {
      // ignore
    }
  }

  function applyTheme(theme: string): void {
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

export function initPageShortcuts(win: Window, doc: Document, base = './', langConfig?: LanguageConfig): void {
  const pages = langConfig?.pages ?? ['trainer', 'kana', 'draw', 'test', 'settings'];
  doc.addEventListener('keydown', (evt: KeyboardEvent) => {
    const tag = (evt.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;

    switch (evt.key) {
      case 'k':
        if (pages.includes('trainer')) win.location.href = base;
        break;
      case 'h':
        if (pages.includes('kana')) win.location.href = base + 'kana/';
        break;
      case 'd':
        if (pages.includes('draw')) win.location.href = base + 'draw/';
        break;
      case 's':
        if (pages.includes('settings')) win.location.href = base + 'settings/';
        break;
      case 'x':
        if (pages.includes('test')) win.location.href = base + 'test/';
        break;
    }
  });
}

interface NavLink {
  href: string;
  label: string;
  page: string;
}

const ALL_NAV_LINKS: NavLink[] = [
  { href: '', label: 'Trainer', page: 'trainer' },
  { href: 'kana/', label: 'Kana basics', page: 'kana' },
  { href: 'draw/', label: 'Draw kanji', page: 'draw' },
  { href: 'test/', label: 'Test', page: 'test' },
  { href: 'settings/', label: 'Settings', page: 'settings' },
];

export function buildNavLinks(doc: Document, langConfig: LanguageConfig, base: string, currentPage: string): void {
  const navList = doc.querySelector('.nav-drawer__list');
  if (!navList) return;
  navList.innerHTML = '';
  const pages = langConfig.pages;
  for (const link of ALL_NAV_LINKS) {
    if (!pages.includes(link.page)) continue;
    const li = doc.createElement('li');
    const a = doc.createElement('a');
    a.href = base + link.href;
    a.className = 'nav-drawer__link';
    a.textContent = link.label;
    if (link.page === currentPage) {
      a.setAttribute('aria-current', 'page');
    }
    li.appendChild(a);
    navList.appendChild(li);
  }
}

export function populateLevelSelect(select: HTMLSelectElement, langConfig: LanguageConfig, doc: Document): void {
  select.innerHTML = '';
  for (const level of langConfig.levels) {
    const opt = doc.createElement('option');
    opt.value = level;
    opt.textContent = level;
    select.appendChild(opt);
  }
  // Add combined option for Japanese
  if (langConfig.id === 'ja') {
    const combinedOpt = doc.createElement('option');
    combinedOpt.value = 'N5-N3';
    combinedOpt.textContent = 'N5\u2013N3';
    select.appendChild(combinedOpt);
  }
  // Add "All" option
  const allOpt = doc.createElement('option');
  allOpt.value = 'ALL';
  allOpt.textContent = langConfig.id === 'ja' ? 'N5\u2013N2' : `${langConfig.levels[0]}\u2013${langConfig.levels[langConfig.levels.length - 1]}`;
  select.appendChild(allOpt);
  select.value = langConfig.defaultLevel;
}

export function initLangToggle(win: Window, doc: Document, langConfig: LanguageConfig): void {
  const btn = doc.getElementById('lang-toggle');
  if (!btn) return;
  btn.textContent = langConfig.flag;
  btn.title = `Switch language (current: ${langConfig.label})`;
  btn.addEventListener('click', () => {
    const next = nextLanguage(langConfig.id);
    setStoredLanguage(win, next);
    win.location.reload();
  });
}

export function bootstrapKanjiApp(
  allKanji: Kanji[],
  win: Window = window,
  doc: Document = document,
  langConfig?: LanguageConfig
): void {
  const effectiveLangConfig = langConfig ?? LANGUAGES.ja;
  const PROGRESS_KEY = langStorageKey(effectiveLangConfig, 'progress-v1');
  const LEVEL_STORAGE_KEY = langStorageKey(effectiveLangConfig, 'level-choice-v1');
  const isFrench = effectiveLangConfig.id === 'fr';

  const tts = createTtsApi(win, effectiveLangConfig);

  const levelSelect = doc.getElementById('level-select') as HTMLSelectElement | null;
  const themeToggle = doc.getElementById('theme-toggle');

  const navToggle = doc.getElementById('nav-toggle');
  const navDrawer = doc.getElementById('nav-drawer');
  const navClose = doc.getElementById('nav-close');

  const cardLevel = doc.getElementById('card-level');
  const cardIndex = doc.getElementById('card-index');
  const cardKanji = doc.getElementById('card-kanji');
  const cardReadings = doc.getElementById('card-readings');
  const cardMeanings = doc.getElementById('card-meanings');
  const detailsSection = doc.getElementById('details-section');
  const cardDetails = doc.getElementById('card-details');
  const cardExampleSentence = doc.getElementById('card-example-sentence');
  const cardExampleReading = doc.getElementById('card-example-reading');
  const cardExampleTranslation = doc.getElementById('card-example-translation');
  const exampleSection = doc.getElementById('example-section');

  const statsSeen = doc.getElementById('stats-seen');
  const statsKnown = doc.getElementById('stats-known');
  const statsToday = doc.getElementById('stats-today');
  const statsSrs = doc.getElementById('stats-srs');

  const toggleReadingsBtn = doc.getElementById('toggle-readings') as HTMLButtonElement | null;
  const markKnownBtn = doc.getElementById('mark-known') as HTMLButtonElement | null;
  const markUnknownBtn = doc.getElementById('mark-unknown') as HTMLButtonElement | null;
  const speakKanjiBtn = doc.getElementById('speak-kanji') as HTMLButtonElement | null;
  const speakExampleBtn = doc.getElementById('speak-example') as HTMLButtonElement | null;
  const speakExampleEnBtn = doc.getElementById('speak-example-en') as HTMLButtonElement | null;

  const writeToggleBtn = doc.getElementById('write-toggle') as HTMLButtonElement | null;
  const writeSection = doc.getElementById('write-section');
  const writeSectionWrapper = doc.getElementById('write-section-wrapper');
  const writeCanvas = doc.getElementById('write-canvas') as HTMLCanvasElement | null;
  const writeClearBtn = doc.getElementById('write-clear') as HTMLButtonElement | null;
  const writeCheckBtn = doc.getElementById('write-check') as HTMLButtonElement | null;
  const writeFeedback = doc.getElementById('write-feedback') as HTMLElement | null;

  initTheme(win, doc, themeToggle);

  // Hide write section for non-Japanese languages
  if (isFrench) {
    if (writeToggleBtn) writeToggleBtn.style.display = 'none';
    if (writeSectionWrapper) writeSectionWrapper.style.display = 'none';
  }

  function openNav() {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.add('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'true');
  }

  function closeNav() {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.remove('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleNav() {
    if (!navDrawer || !navToggle) return;
    if (navDrawer.classList.contains('nav-drawer--open')) {
      closeNav();
    } else {
      openNav();
    }
  }

  function readStoredLevelValue() {
    try {
      return win.localStorage.getItem(LEVEL_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function writeStoredLevelValue(value: string): void {
    try {
      win.localStorage.setItem(LEVEL_STORAGE_KEY, value);
    } catch {
      // ignore storage failures
    }
  }

  const defaultLevelValue = levelSelect && levelSelect.value ? levelSelect.value : 'N3';
  const storedRawLevel = readStoredLevelValue();
  const initialSelectValue = storedRawLevel
    ? normalizeLevelPreference(storedRawLevel, defaultLevelValue)
    : defaultLevelValue;

  if (levelSelect) {
    levelSelect.value = initialSelectValue;
  }

  const initialLevels = levelsFromSelectValue(initialSelectValue, effectiveLangConfig);
  let state: QuizState = createSession(allKanji, { levels: initialLevels });
  let perKanjiProgress: Record<string, Record<string, unknown>> = {};

  function safeNum(val: unknown, fallback = 0): number {
    return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  }

  let detailsOpen = false;
  let writing = false;
  let peekKanji = false;
  let clearWriteCanvas: (() => void) | null = null;

  function updateWritingUi(currentState: QuizState): void {
    if (!cardKanji || !writeToggleBtn) return;
    const hasKanji = currentState && currentState.pool?.length > 0 && currentState.currentIndex >= 0;

    // Write section + main kanji visibility
    if (writeSection) {
      if (writing) {
        writeSection.classList.add('card__section-body--visible');
        writeSection.classList.remove('card__section-body--hidden');
      } else {
        writeSection.classList.add('card__section-body--hidden');
        writeSection.classList.remove('card__section-body--visible');
      }
    }

    if (writing && !peekKanji) {
      cardKanji.classList.add('card__kanji--hidden');
    } else {
      cardKanji.classList.remove('card__kanji--hidden');
    }

    // Details and example sections
    if (detailsSection) {
      if (writing) {
        detailsSection.classList.add('card__section--hidden');
      } else {
        detailsSection.classList.remove('card__section--hidden');
      }
    }

    if (exampleSection) {
      if (writing) {
        exampleSection.classList.add('card__section--hidden');
      } else {
        exampleSection.classList.remove('card__section--hidden');
      }
    }

    // Write section wrapper visibility
    if (writeSectionWrapper) {
      if (writing) {
        writeSectionWrapper.classList.remove('card__section--hidden');
      } else {
        writeSectionWrapper.classList.add('card__section--hidden');
      }
    }

    // Buttons
    writeToggleBtn.disabled = !hasKanji;

    if (writeClearBtn) {
      writeClearBtn.disabled = !writing || !hasKanji;
    }
    if (writeCheckBtn) {
      writeCheckBtn.disabled = !writing || !hasKanji;
    }
  }

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

  function getCurrentKanji(currentState: QuizState): Kanji | null {
    const { pool, currentIndex } = currentState;
    if (!pool.length || currentIndex < 0) return null;
    return pool[currentIndex];
  }

  function pickNextIndex(currentState: QuizState, nowMs = Date.now()): number {
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
    const pick = windowCards.length ? windowCards : source;
    const chosen = pick[Math.floor(Math.random() * pick.length)];
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

  function render(currentState: QuizState): void {
    const { pool, currentIndex } = currentState;

    const hasKanji = pool.length > 0 && currentIndex >= 0;
    if (toggleReadingsBtn) toggleReadingsBtn.disabled = !hasKanji;
    if (markKnownBtn) markKnownBtn.disabled = !hasKanji;
    if (markUnknownBtn) markUnknownBtn.disabled = !hasKanji;

    if (!tts.available) {
      if (speakKanjiBtn) {
        speakKanjiBtn.disabled = true;
        speakKanjiBtn.title = 'Text-to-speech is not available in this browser.';
      }
      if (speakExampleBtn) {
        speakExampleBtn.disabled = true;
        speakExampleBtn.title = 'Text-to-speech is not available in this browser.';
      }
      if (speakExampleEnBtn) speakExampleEnBtn.disabled = true;
    } else {
      if (speakKanjiBtn) speakKanjiBtn.disabled = !hasKanji;
      if (speakExampleBtn) speakExampleBtn.disabled = !hasKanji;
      if (speakExampleEnBtn) speakExampleEnBtn.disabled = !hasKanji;
    }

    if (!hasKanji) {
      if (cardLevel) cardLevel.textContent = 'NO DATA';
      if (cardIndex) cardIndex.textContent = '';
      if (cardKanji) cardKanji.textContent = '—';
      if (cardReadings) cardReadings.textContent = 'No kanji available for this selection.';
      if (cardMeanings) cardMeanings.textContent = '';
      if (cardExampleSentence) cardExampleSentence.textContent = '';
      if (cardExampleReading) cardExampleReading.textContent = '';
      if (cardExampleTranslation) cardExampleTranslation.textContent = '';
      if (statsSeen) statsSeen.textContent = 'Seen: 0';
      if (statsKnown) statsKnown.textContent = 'Known: 0 (0%)';
      if (statsToday) statsToday.textContent = '';
      if (statsSrs) statsSrs.textContent = '';
      detailsOpen = false;
      writing = false;
      if (cardDetails) {
        cardDetails.classList.add('card__section-body--hidden');
        cardDetails.classList.remove('card__section-body--visible');
      }
      if (detailsSection) {
        detailsSection.classList.remove('card__section--hidden');
      }
      if (toggleReadingsBtn) {
        toggleReadingsBtn.textContent = '👀';
      }
      if (clearWriteCanvas) {
        clearWriteCanvas();
      }
      if (exampleSection) {
        exampleSection.classList.remove('card__section--hidden');
      }
      updateWritingUi(state);
      return;
    }

    const kanji = pool[currentIndex];
    const indexLabel = `${currentIndex + 1} / ${pool.length}`;
    if (cardLevel) cardLevel.textContent = kanji.level || '';
    if (cardIndex) cardIndex.textContent = indexLabel;
    if (cardKanji) cardKanji.textContent = kanji.kanji || '';

    const readingsPieces = [];
    if (isFrench) {
      if (kanji.kunyomi && kanji.kunyomi.length) {
        readingsPieces.push(`/${kanji.kunyomi.join(', ')}/`);
      }
    } else {
      if (kanji.onyomi && kanji.onyomi.length) {
        readingsPieces.push(`音: ${kanji.onyomi.join('、 ')}`);
      }
      if (kanji.kunyomi && kanji.kunyomi.length) {
        readingsPieces.push(`訓: ${kanji.kunyomi.join('、 ')}`);
      }
    }
    if (cardReadings) cardReadings.textContent = readingsPieces.join('　');

    if (cardMeanings) cardMeanings.textContent = (kanji.meanings || []).join(', ');

    if (kanji.example) {
      if (cardExampleSentence) cardExampleSentence.textContent = kanji.example.sentence || '';
      if (cardExampleReading) cardExampleReading.textContent = kanji.example.reading || '';
      if (cardExampleTranslation) cardExampleTranslation.textContent = kanji.example.translation || '';
    } else {
      if (cardExampleSentence) cardExampleSentence.textContent = '';
      if (cardExampleReading) cardExampleReading.textContent = '';
      if (cardExampleTranslation) cardExampleTranslation.textContent = '';
    }

    if (cardDetails && toggleReadingsBtn) {
      if (detailsOpen) {
        cardDetails.classList.add('card__section-body--visible');
        cardDetails.classList.remove('card__section-body--hidden');
        toggleReadingsBtn.textContent = '🙈';
      } else {
        cardDetails.classList.add('card__section-body--hidden');
        cardDetails.classList.remove('card__section-body--visible');
        toggleReadingsBtn.textContent = '👀';
      }
    }

    const accuracy = getAccuracy(currentState);
    if (statsSeen) statsSeen.textContent = `Seen: ${currentState.stats.seen}`;
    if (statsKnown) statsKnown.textContent = `Known: ${currentState.stats.known} (${accuracy.toFixed(0)}%)`;
    const dailyGoal = readDailyGoal(win, effectiveLangConfig);
    const dailyCount = getDailyKnownCount(win, effectiveLangConfig);
    if (statsToday) statsToday.textContent = `Today: ${dailyCount} / ${dailyGoal}`;

    if (statsSrs) {
      const now = Date.now();
      let dueCount = 0;
      let newCount = 0;
      for (const k of currentState.pool) {
        const entry = perKanjiProgress[k.id];
        if (!entry) {
          newCount++;
        } else {
          const srs = normalizeSrsState(entry as Partial<import('../types.js').SrsState>, now);
          if (srs.due <= now) dueCount++;
        }
      }
      statsSrs.textContent = `Due: ${dueCount} · New: ${newCount}`;
    }

    updateWritingUi(state);
  }

  if (levelSelect) {
    levelSelect.addEventListener('change', () => {
      const levels = levelsFromSelectValue(levelSelect.value, effectiveLangConfig);
      state = setLevels(state, allKanji, levels);
      detailsOpen = false;
      render(state);
      writeStoredLevelValue(levelSelect.value);
    });
  }

  if (toggleReadingsBtn) {
    toggleReadingsBtn.addEventListener('click', () => {
      detailsOpen = !detailsOpen;
      render(state);
    });
  }

  if (markKnownBtn) {
    markKnownBtn.addEventListener('click', () => {
      const answered = getCurrentKanji(state);
      const now = Date.now();
      state = markKnown(state);
      incrementDailyKnown(win, effectiveLangConfig);
      if (answered && answered.id) {
        const prev = perKanjiProgress[answered.id] || {};
        const srsNext = updateSrsState(prev as Partial<import('../types.js').SrsState>, 'good', now);
        perKanjiProgress = {
          ...perKanjiProgress,
          [answered.id]: {
            seen: safeNum(prev.seen) + 1,
            known: safeNum(prev.known) + 1,
            unknown: safeNum(prev.unknown),
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
      writing = false;
      peekKanji = false;
      detailsOpen = false;
      if (clearWriteCanvas) {
        clearWriteCanvas();
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
        const prev = perKanjiProgress[answered.id] || {};
        const srsNext = updateSrsState(prev as Partial<import('../types.js').SrsState>, 'again', now);
        perKanjiProgress = {
          ...perKanjiProgress,
          [answered.id]: {
            seen: safeNum(prev.seen) + 1,
            known: safeNum(prev.known),
            unknown: safeNum(prev.unknown) + 1,
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
      writing = false;
      peekKanji = false;
      detailsOpen = false;
      if (clearWriteCanvas) {
        clearWriteCanvas();
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

  if (speakExampleEnBtn && tts.available) {
    speakExampleEnBtn.addEventListener('click', () => {
      const { pool, currentIndex } = state;
      if (!pool.length || currentIndex < 0) return;
      tts.speakExampleTranslation(pool[currentIndex]);
    });
  }

  if (navToggle && navDrawer) {
    navToggle.addEventListener('click', toggleNav);
  }

  if (navClose) {
    navClose.addEventListener('click', closeNav);
  }

  if (writeCanvas && writeClearBtn && writeCheckBtn && writeFeedback) {
    const size = 192;
    writeCanvas.width = size;
    writeCanvas.height = size;
    const ctx = writeCanvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#f9fafb';

      let drawing = false;
      let hasInk = false;

      function drawGuideKanji() {
        const current = getCurrentKanji(state);
        if (!current?.kanji) return;
        ctx!.save();
        ctx!.fillStyle = 'rgba(249, 250, 251, 0.22)';
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.font = '140px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        if (typeof ctx!.filter !== 'undefined') {
          ctx!.filter = 'blur(4px)';
        }
        ctx!.fillText(current.kanji, size / 2, size / 2);
        ctx!.restore();
      }

      clearWriteCanvas = function clearWriteCanvasImpl() {
        ctx!.fillStyle = '#1e293b';
        ctx!.fillRect(0, 0, size, size);
        drawGuideKanji();
        writeFeedback!.textContent = '';
        writeFeedback!.classList.remove('write-feedback--pass', 'write-feedback--fail');
        hasInk = false;
      };

      clearWriteCanvas();

      function getPos(evt: PointerEvent) {
        const rect = writeCanvas!.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        const scaleX = writeCanvas!.width / rect.width;
        const scaleY = writeCanvas!.height / rect.height;
        return {
          x: x * scaleX,
          y: y * scaleY
        };
      }

      writeCanvas!.addEventListener('pointerdown', (evt: PointerEvent) => {
        drawing = true;
        hasInk = true;
        writeCanvas!.setPointerCapture(evt.pointerId);
        const { x, y } = getPos(evt);
        detailsOpen = false;
        render(state);
        ctx!.beginPath();
        ctx!.moveTo(x, y);
      });

      function stopDrawing(evt: PointerEvent) {
        if (!drawing) return;
        drawing = false;
        if (evt && writeCanvas!.hasPointerCapture(evt.pointerId)) {
          writeCanvas!.releasePointerCapture(evt.pointerId);
        }
      }

      writeCanvas!.addEventListener('pointermove', (evt: PointerEvent) => {
        if (!drawing) return;
        const { x, y } = getPos(evt);
        ctx!.lineTo(x, y);
        ctx!.stroke();
      });
      writeCanvas!.addEventListener('pointerup', stopDrawing);
      writeCanvas!.addEventListener('pointercancel', stopDrawing);
      writeCanvas!.addEventListener('pointerleave', stopDrawing);

      writeClearBtn.addEventListener('click', () => {
        if (clearWriteCanvas) {
          clearWriteCanvas();
        }
      });

      function scoreAgainstCurrentKanji() {
        const current = getCurrentKanji(state);
        if (!current || !current.kanji) {
          writeFeedback!.textContent = 'No kanji selected.';
          return;
        }
        if (!hasInk) {
          writeFeedback!.textContent = 'Draw the kanji above, then tap Check.';
          return;
        }

        const targetSize = 32;
        const tmpCanvas = doc.createElement('canvas');
        tmpCanvas.width = targetSize;
        tmpCanvas.height = targetSize;
        const tmpCtx = tmpCanvas.getContext('2d');
        if (!tmpCtx) {
          writeFeedback!.textContent = 'Drawing not supported in this browser.';
          return;
        }

        tmpCtx.drawImage(writeCanvas!, 0, 0, targetSize, targetSize);
        const userImage = tmpCtx.getImageData(0, 0, targetSize, targetSize);
        const userData = userImage.data;

        // Render glyph at the same resolution as the user canvas, then
        // downscale to targetSize so both images go through identical scaling.
        const glyphFull = doc.createElement('canvas');
        glyphFull.width = size;
        glyphFull.height = size;
        const glyphFullCtx = glyphFull.getContext('2d');
        if (!glyphFullCtx) {
          writeFeedback!.textContent = 'Drawing not supported in this browser.';
          return;
        }
        glyphFullCtx.fillStyle = '#1e293b';
        glyphFullCtx.fillRect(0, 0, size, size);
        glyphFullCtx.fillStyle = '#f9fafb';
        glyphFullCtx.textAlign = 'center';
        glyphFullCtx.textBaseline = 'middle';
        glyphFullCtx.font =
          '140px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        glyphFullCtx.fillText(current.kanji, size / 2, size / 2);

        const glyphSmall = doc.createElement('canvas');
        glyphSmall.width = targetSize;
        glyphSmall.height = targetSize;
        const glyphSmallCtx = glyphSmall.getContext('2d');
        if (!glyphSmallCtx) {
          writeFeedback!.textContent = 'Drawing not supported in this browser.';
          return;
        }
        glyphSmallCtx.drawImage(glyphFull, 0, 0, targetSize, targetSize);
        const glyphImage = glyphSmallCtx.getImageData(0, 0, targetSize, targetSize);
        const glyphData = glyphImage.data;

        const result = scoreStroke(userData, glyphData);
        const scoreValue = result.score;

        const passed = scoreValue >= 70;

        // Japanese convention: ⭕ red for pass, ❌ blue for fail
        writeFeedback!.classList.remove('write-feedback--pass', 'write-feedback--fail');
        if (result.userInk < 12) {
          writeFeedback!.textContent = `${scoreValue}/💯`;
          writeFeedback!.classList.add('write-feedback--fail');
        } else if (passed) {
          writeFeedback!.textContent = `⭕ ${scoreValue}/💯`;
          writeFeedback!.classList.add('write-feedback--pass');
        } else {
          writeFeedback!.textContent = `❌ ${scoreValue}/💯`;
          writeFeedback!.classList.add('write-feedback--fail');
        }
      }

      writeCheckBtn.addEventListener('click', scoreAgainstCurrentKanji);
    }
  }

  if (writeToggleBtn && writeSection && writeCanvas) {
    writeToggleBtn.addEventListener('click', () => {
      const current = getCurrentKanji(state);
      if (!current) return;
      writing = !writing;
      if (clearWriteCanvas) {
        clearWriteCanvas();
      }
      if (!writing) {
        peekKanji = false;
      }
      updateWritingUi(state);
    });
  }

  // Shortcut help overlay
  const shortcutOverlay = doc.getElementById('shortcut-overlay');

  function toggleShortcutHelp() {
    if (!shortcutOverlay) return;
    shortcutOverlay.hidden = !shortcutOverlay.hidden;
  }

  if (shortcutOverlay) {
    shortcutOverlay.addEventListener('click', () => {
      shortcutOverlay.hidden = true;
    });
  }

  // Keyboard shortcuts (desktop convenience)
  doc.addEventListener('keydown', (evt: KeyboardEvent) => {
    // Skip if user is typing in an input/select or modifier keys are held
    const tag = (evt.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;

    // Close overlay on Escape
    if (evt.key === 'Escape' && shortcutOverlay && !shortcutOverlay.hidden) {
      shortcutOverlay.hidden = true;
      return;
    }

    switch (evt.key) {
      case '?':
        toggleShortcutHelp();
        break;
      case ' ':
      case 'Enter':
        // Toggle reveal
        evt.preventDefault();
        if (toggleReadingsBtn && !toggleReadingsBtn.disabled) {
          toggleReadingsBtn.click();
        }
        break;
      case '1':
        // I know this
        if (markKnownBtn && !markKnownBtn.disabled) {
          markKnownBtn.click();
        }
        break;
      case '0':
      case '2':
        // Don't know yet
        if (markUnknownBtn && !markUnknownBtn.disabled) {
          markUnknownBtn.click();
        }
        break;
      case 'r':
        // Speak kanji reading
        if (speakKanjiBtn && !speakKanjiBtn.disabled) {
          speakKanjiBtn.click();
        }
        break;
      case 'e':
        // Speak example sentence
        if (speakExampleBtn && !speakExampleBtn.disabled) {
          speakExampleBtn.click();
        }
        break;
      case 't':
        // Speak English translation
        if (speakExampleEnBtn && !speakExampleEnBtn.disabled) {
          speakExampleEnBtn.click();
        }
        break;
      case '[':
        // Previous level
        if (levelSelect) {
          const idx = levelSelect.selectedIndex;
          if (idx > 0) {
            levelSelect.selectedIndex = idx - 1;
            levelSelect.dispatchEvent(new Event('change'));
          }
        }
        break;
      case ']':
        // Next level
        if (levelSelect) {
          const idx = levelSelect.selectedIndex;
          if (idx < levelSelect.options.length - 1) {
            levelSelect.selectedIndex = idx + 1;
            levelSelect.dispatchEvent(new Event('change'));
          }
        }
        break;
    }
  });

  initPageShortcuts(win, doc, './', effectiveLangConfig);

  render(state);
}