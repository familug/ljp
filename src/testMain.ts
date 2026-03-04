import type { Kanji, SrsState, TestState } from './types.js';
import { initTheme, initPageShortcuts, createTtsApi, levelsFromSelectValue, initLangToggle, buildNavLinks, populateLevelSelect } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { getCachedKanji, setCachedKanji } from './data/kanjiCache.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';
import { BUILD_META, formatBuildLabel } from './buildMeta.js';
import { registerSw } from './registerSw.js';
import { normalizeSrsState, updateSrsState } from './core/srs.js';
import {
  getDueKanji,
  createTestSession,
  answerQuestion,
  nextQuestion,
  computeScore,
  getWrongAnswers,
  testResultsToSrsGrades
} from './core/testCore.js';
import { getStoredLanguage, LANGUAGES, storageKey } from './core/language.js';
import type { LanguageConfig } from './core/language.js';
import { loadFrenchVocab } from './data/frenchSource.js';

function filterByLevels(kanji: Kanji[], levels: string[]): Kanji[] {
  return kanji.filter((k) => levels.includes(k.level));
}

function kanjiByLevelMap(kanji: Kanji[]): Record<string, Kanji[]> {
  const map: Record<string, Kanji[]> = {};
  for (const k of kanji) {
    if (!map[k.level]) map[k.level] = [];
    map[k.level].push(k);
  }
  return map;
}

function applyBuildMeta(win: Window, doc: Document): void {
  const el = doc.getElementById('build-meta');
  if (!el || !BUILD_META) return;
  el.textContent = formatBuildLabel(BUILD_META.hash, BUILD_META.datetimeIso);
}

function showPhase(doc: Document, phase: 'intro' | 'question' | 'results'): void {
  const loading = doc.getElementById('app-loading');
  if (loading) loading.hidden = true;

  const intro = doc.getElementById('test-intro');
  const question = doc.getElementById('test-question');
  const results = doc.getElementById('test-results');

  if (intro) intro.classList.toggle('app-view--hidden', phase !== 'intro');
  if (question) question.classList.toggle('app-view--hidden', phase !== 'question');
  if (results) results.classList.toggle('app-view--hidden', phase !== 'results');
}

function getTypeLabel(type: string, langConfig: LanguageConfig): string {
  const isFrench = langConfig.id === 'fr';
  switch (type) {
    case 'kanji-to-meaning': return isFrench ? 'Word \u2192 Meaning' : 'Kanji \u2192 Meaning';
    case 'meaning-to-kanji': return isFrench ? 'Meaning \u2192 Word' : 'Meaning \u2192 Kanji';
    case 'kanji-to-reading': return 'Kanji \u2192 Reading';
    case 'reading-to-kanji': return 'Reading \u2192 Kanji';
    default: return 'Question';
  }
}

function bootstrapTestApp(allKanji: Kanji[], win: Window, doc: Document, langConfig: LanguageConfig): void {
  const PROGRESS_KEY = storageKey(langConfig, 'progress-v1');
  const LEVEL_STORAGE_KEY = storageKey(langConfig, 'level-choice-v1');
  const isFrench = langConfig.id === 'fr';

  const themeToggle = doc.getElementById('theme-toggle');
  const navToggle = doc.getElementById('nav-toggle');
  const navDrawer = doc.getElementById('nav-drawer');
  const navClose = doc.getElementById('nav-close');

  initTheme(win, doc, themeToggle);

  function openNav(): void {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.add('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'true');
  }

  function closeNav(): void {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.remove('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleNav(): void {
    if (!navDrawer || !navToggle) return;
    if (navDrawer.classList.contains('nav-drawer--open')) {
      closeNav();
    } else {
      openNav();
    }
  }

  if (navToggle && navDrawer) {
    navToggle.addEventListener('click', toggleNav);
  }
  if (navClose) {
    navClose.addEventListener('click', closeNav);
  }

  // Load per-kanji progress
  let perKanjiProgress: Record<string, Record<string, unknown>> = {};
  try {
    const raw = win.localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.perKanji && typeof parsed.perKanji === 'object') {
        perKanjiProgress = parsed.perKanji;
      }
    }
  } catch {
    // ignore
  }

  // Level selector
  const levelSelect = doc.getElementById('test-level-select') as HTMLSelectElement | null;

  // Populate level select dynamically
  if (levelSelect) populateLevelSelect(levelSelect, langConfig, doc);

  // Restore persisted level
  let storedLevel: string | null = null;
  try { storedLevel = win.localStorage.getItem(LEVEL_STORAGE_KEY); } catch { /* ignore */ }
  if (storedLevel && levelSelect) {
    const valid = Array.from(levelSelect.options).some((o) => o.value === storedLevel);
    if (valid) levelSelect.value = storedLevel;
  }

  function getSelectedLevels(): string[] {
    return levelsFromSelectValue(levelSelect ? levelSelect.value : langConfig.defaultLevel, langConfig);
  }

  function filteredKanji(): Kanji[] {
    return filterByLevels(allKanji, getSelectedLevels());
  }

  const allowedTypes = langConfig.questionTypes;
  const nowMs = Date.now();
  let currentFiltered = filteredKanji();
  let dueKanji = getDueKanji(currentFiltered, perKanjiProgress, nowMs);
  let state: TestState = createTestSession(dueKanji, kanjiByLevelMap(currentFiltered), allowedTypes);

  // DOM elements
  const startBtn = doc.getElementById('test-start') as HTMLButtonElement | null;
  const dueCountEl = doc.getElementById('test-due-count');
  const qTypeEl = doc.getElementById('test-q-type');
  const qProgressEl = doc.getElementById('test-q-progress');
  const promptEl = doc.getElementById('test-prompt');
  const choicesEl = doc.getElementById('test-choices');
  const nextBtn = doc.getElementById('test-next') as HTMLButtonElement | null;
  const scoreEl = doc.getElementById('test-score');
  const scoreDisplayEl = doc.getElementById('test-score-display');
  const reviewSection = doc.getElementById('test-review-section');
  const reviewList = doc.getElementById('test-review-list');
  const retakeBtn = doc.getElementById('test-retake') as HTMLButtonElement | null;

  const kanjiDetailEl = doc.getElementById('test-kanji-detail');
  const tts = createTtsApi(win, langConfig);

  // Build lookup map: kanjiId -> Kanji
  const kanjiById: Record<string, Kanji> = {};
  for (const k of allKanji) kanjiById[k.id] = k;

  const choiceBtns = choicesEl
    ? (Array.from(choicesEl.querySelectorAll('.test-choice')) as HTMLButtonElement[])
    : [];

  let answered = false;

  function showKanjiDetail(kanjiId: string): void {
    if (!kanjiDetailEl) return;
    const k = kanjiById[kanjiId];
    if (!k) { kanjiDetailEl.classList.remove('test-kanji-detail--visible'); return; }

    const parts: string[] = [];
    if (k.meanings?.length) {
      parts.push(`<div class="test-kanji-detail__row"><span>${k.meanings.join(', ')}</span></div>`);
    }
    if (isFrench) {
      if (k.kunyomi?.length) {
        parts.push(`<div class="test-kanji-detail__row"><span class="test-kanji-detail__label">IPA</span><span>/${k.kunyomi.join(', ')}/</span></div>`);
      }
    } else {
      if (k.onyomi?.length) {
        parts.push(`<div class="test-kanji-detail__row"><span class="test-kanji-detail__label">On'yomi</span><span>${k.onyomi.join(', ')}</span></div>`);
      }
      if (k.kunyomi?.length) {
        parts.push(`<div class="test-kanji-detail__row"><span class="test-kanji-detail__label">Kun'yomi</span><span>${k.kunyomi.join(', ')}</span></div>`);
      }
    }
    if (k.example?.sentence) {
      const speakHtml = tts.available
        ? `<button type="button" class="button button--ghost button--small test-speak-example" aria-label="Speak example">🔊</button>`
        : '';
      if (isFrench) {
        parts.push(`<div class="test-kanji-detail__example">${k.example.sentence} ${speakHtml}<br>${k.example.translation}</div>`);
      } else {
        parts.push(`<div class="test-kanji-detail__example">${k.example.sentence} ${speakHtml}<br>${k.example.reading}<br>${k.example.translation}</div>`);
      }
    }
    kanjiDetailEl.innerHTML = parts.join('');

    // Wire speak button
    const speakBtn = kanjiDetailEl.querySelector('.test-speak-example') as HTMLButtonElement | null;
    if (speakBtn) {
      speakBtn.addEventListener('click', () => tts.speakExample(k));
    }

    kanjiDetailEl.classList.add('test-kanji-detail--visible');
  }

  function hideKanjiDetail(): void {
    if (!kanjiDetailEl) return;
    kanjiDetailEl.innerHTML = '';
    kanjiDetailEl.classList.remove('test-kanji-detail--visible');
  }

  // Update intro text based on language
  const introDesc = doc.querySelector('#test-intro .card__section-content p');
  if (introDesc && isFrench) {
    introDesc.innerHTML = 'You\u2019ll be quizzed on <strong>up to 40</strong> SRS-due words with multiple-choice questions covering meanings.';
  }

  // Intro
  function renderIntro(): void {
    showPhase(doc, 'intro');
    const qCount = state.questions.length;
    const wordLabel = langConfig.wordLabel;
    if (dueCountEl) {
      if (qCount === 0) {
        dueCountEl.textContent = `No ${wordLabel} are due for review right now. Come back later!`;
        if (startBtn) startBtn.disabled = true;
      } else {
        dueCountEl.textContent = `${dueKanji.length} ${wordLabel} due \u00b7 ${qCount} questions`;
        if (startBtn) startBtn.disabled = false;
      }
    }
  }

  // Question
  function renderQuestion(): void {
    showPhase(doc, 'question');
    answered = false;
    hideKanjiDetail();
    if (nextBtn) nextBtn.disabled = true;

    const q = state.questions[state.currentQuestionIndex];
    if (!q) return;

    if (qTypeEl) qTypeEl.textContent = getTypeLabel(q.type, langConfig);
    if (qProgressEl) qProgressEl.textContent = `${state.currentQuestionIndex + 1} / ${state.questions.length}`;
    if (promptEl) {
      promptEl.textContent = q.prompt;
      const isKanjiPrompt = q.type === 'kanji-to-meaning' || q.type === 'kanji-to-reading';
      promptEl.classList.toggle('test-prompt--large', isKanjiPrompt);
    }

    for (let i = 0; i < choiceBtns.length; i++) {
      const btn = choiceBtns[i];
      btn.textContent = q.choices[i] ?? '';
      btn.disabled = false;
      btn.classList.remove('test-choice--correct', 'test-choice--wrong');
      btn.style.display = q.choices[i] != null ? '' : 'none';
    }
  }

  function handleChoice(chosenIndex: number): void {
    if (answered) return;
    if (state.phase !== 'question') return;

    state = answerQuestion(state, chosenIndex);
    answered = true;

    const q = state.questions[state.currentQuestionIndex];
    for (let i = 0; i < choiceBtns.length; i++) {
      choiceBtns[i].disabled = true;
      if (i === q.correctIndex) {
        choiceBtns[i].classList.add('test-choice--correct');
      } else if (i === chosenIndex) {
        choiceBtns[i].classList.add('test-choice--wrong');
      }
    }

    if (nextBtn) nextBtn.disabled = false;
    showKanjiDetail(q.kanjiId);
  }

  // Results
  function renderResults(): void {
    showPhase(doc, 'results');

    const { correct, total, percentage } = computeScore(state);
    if (scoreEl) scoreEl.textContent = `${correct} / ${total}`;
    if (scoreDisplayEl) {
      const color = percentage >= 80 ? 'test-score--good' : percentage >= 50 ? 'test-score--ok' : 'test-score--bad';
      scoreDisplayEl.innerHTML = '';
      scoreDisplayEl.className = 'test-score-display ' + color;
      const big = doc.createElement('div');
      big.className = 'test-score-big';
      big.textContent = `${percentage}%`;
      const sub = doc.createElement('div');
      sub.className = 'test-score-sub';
      sub.textContent = `${correct} correct out of ${total}`;
      scoreDisplayEl.appendChild(big);
      scoreDisplayEl.appendChild(sub);
    }

    const wrong = getWrongAnswers(state);
    if (reviewSection && reviewList) {
      if (wrong.length > 0) {
        reviewSection.style.display = '';
        reviewList.innerHTML = '';
        for (const { question, answer } of wrong) {
          const li = doc.createElement('li');
          li.className = 'test-review-item';

          const prompt = doc.createElement('span');
          prompt.className = 'test-review-prompt';
          prompt.textContent = question.prompt;

          const correct = doc.createElement('span');
          correct.className = 'test-review-correct';
          correct.textContent = question.choices[question.correctIndex];

          const chosen = doc.createElement('span');
          chosen.className = 'test-review-chosen';
          chosen.textContent = question.choices[answer.chosenIndex];

          li.appendChild(prompt);
          li.appendChild(doc.createTextNode(' \u2192 '));
          li.appendChild(correct);
          li.appendChild(doc.createTextNode(' (you: '));
          li.appendChild(chosen);
          li.appendChild(doc.createTextNode(')'));
          reviewList.appendChild(li);
        }
      } else {
        reviewSection.style.display = 'none';
      }
    }

    // Batch SRS update
    const grades = testResultsToSrsGrades(state);
    const now = Date.now();
    let updated = false;

    for (const [kanjiId, grade] of Object.entries(grades)) {
      const prev = perKanjiProgress[kanjiId] || {};
      const srsNext = updateSrsState(prev as Partial<SrsState>, grade, now);
      const seen = typeof prev.seen === 'number' ? prev.seen : 0;
      const known = typeof prev.known === 'number' ? prev.known : 0;
      const unknown = typeof prev.unknown === 'number' ? prev.unknown : 0;

      perKanjiProgress = {
        ...perKanjiProgress,
        [kanjiId]: {
          ...prev,
          seen: seen + 1,
          known: grade === 'good' ? known + 1 : known,
          unknown: grade === 'again' ? unknown + 1 : unknown,
          lastResult: grade === 'good' ? 'known' : 'unknown',
          ...srsNext
        }
      };
      updated = true;
    }

    if (updated) {
      try {
        const raw = win.localStorage.getItem(PROGRESS_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        existing.perKanji = perKanjiProgress;
        win.localStorage.setItem(PROGRESS_KEY, JSON.stringify(existing));
      } catch {
        // ignore
      }
    }
  }

  function render(): void {
    switch (state.phase) {
      case 'intro': renderIntro(); break;
      case 'question': renderQuestion(); break;
      case 'results': renderResults(); break;
    }
  }

  // Event handlers
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (state.questions.length === 0) return;
      state = { ...state, phase: 'question' };
      render();
    });
  }

  for (const btn of choiceBtns) {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx ?? '', 10);
      if (!Number.isNaN(idx)) handleChoice(idx);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (!answered) return;
      state = nextQuestion(state);
      render();
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      const freshNow = Date.now();
      currentFiltered = filteredKanji();
      const freshDue = getDueKanji(currentFiltered, perKanjiProgress, freshNow);
      state = createTestSession(freshDue, kanjiByLevelMap(currentFiltered), allowedTypes);
      state = { ...state, phase: state.questions.length > 0 ? 'question' : 'intro' };
      render();
    });
  }

  if (levelSelect) {
    levelSelect.addEventListener('change', () => {
      try { win.localStorage.setItem(LEVEL_STORAGE_KEY, levelSelect.value); } catch { /* ignore */ }
      currentFiltered = filteredKanji();
      dueKanji = getDueKanji(currentFiltered, perKanjiProgress, Date.now());
      state = createTestSession(dueKanji, kanjiByLevelMap(currentFiltered), allowedTypes);
      render();
    });
  }

  // Keyboard shortcuts
  doc.addEventListener('keydown', (evt: KeyboardEvent) => {
    const tag = (evt.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;

    if (state.phase === 'intro') {
      if (evt.key === ' ' || evt.key === 'Enter') {
        evt.preventDefault();
        if (startBtn && !startBtn.disabled) startBtn.click();
      }
      return;
    }

    if (state.phase === 'question') {
      if (!answered) {
        const num = parseInt(evt.key, 10);
        if (num >= 1 && num <= 4) {
          evt.preventDefault();
          handleChoice(num - 1);
          return;
        }
      }
      if (answered && (evt.key === ' ' || evt.key === 'Enter')) {
        evt.preventDefault();
        if (nextBtn && !nextBtn.disabled) nextBtn.click();
      }
      return;
    }

    if (state.phase === 'results') {
      if (evt.key === ' ' || evt.key === 'Enter') {
        evt.preventDefault();
        if (retakeBtn) retakeBtn.click();
      }
    }
  });

  render();
}

function showApp(doc: Document): void {
  const loading = doc.getElementById('app-loading');
  if (loading) loading.hidden = true;
}

async function start(): Promise<void> {
  const win = window;
  const doc = document;
  const langId = getStoredLanguage(win);
  const langConfig = LANGUAGES[langId];

  initLangToggle(win, doc, langConfig);
  buildNavLinks(doc, langConfig, '../', 'test');

  // Update subtitle
  const subtitle = doc.querySelector('.app-subtitle');
  if (subtitle) subtitle.textContent = langConfig.id === 'fr' ? 'Multiple-choice vocabulary test' : 'Multiple-choice kanji test';

  let storage: Storage | null = null;
  try { storage = win.localStorage; } catch { /* private browsing */ }

  if (langId === 'fr') {
    const allFrench = loadFrenchVocab(langConfig.levels);
    bootstrapTestApp(allFrench, win, doc, langConfig);
    showApp(doc);
    return;
  }

  // Japanese: cache-first
  const cacheKey = storageKey(langConfig, 'cache-v1');
  const cached = getCachedKanji(storage, cacheKey) as Kanji[] | null;

  if (cached && cached.length > 0) {
    bootstrapTestApp(cached, win, doc, langConfig);
    showApp(doc);
    loadJlptKanji(['N5', 'N4', 'N3', 'N2'])
      .then((fresh) => { setCachedKanji(storage, fresh, cacheKey); })
      .catch(() => {});
    return;
  }

  try {
    const allKanji = await loadJlptKanji(['N5', 'N4', 'N3', 'N2']);
    setCachedKanji(storage, allKanji, cacheKey);
    bootstrapTestApp(allKanji, win, doc, langConfig);
  } catch (err) {
    console.error('Failed to load JLPT kanji, using sample data.', err);
    bootstrapTestApp(SAMPLE_KANJI, win, doc, langConfig);
  }
  showApp(doc);
}

registerSw(window);
applyBuildMeta(window, document);
initPageShortcuts(window, document, '../', LANGUAGES[getStoredLanguage(window)]);
start();
