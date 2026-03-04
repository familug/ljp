import { initTheme, initPageShortcuts, createTtsApi } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { getCachedKanji, setCachedKanji } from './data/kanjiCache.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';
import { BUILD_META, formatBuildLabel } from './buildMeta.js';
import { registerSw } from './registerSw.js';
import { updateSrsState } from './core/srs.js';
import { getDueKanji, createTestSession, answerQuestion, nextQuestion, computeScore, getWrongAnswers, testResultsToSrsGrades } from './core/testCore.js';
const PROGRESS_KEY = 'jlpt-kanji-progress-v1';
const LEVEL_STORAGE_KEY = 'jlpt-level-choice-v1';
function levelsFromSelectValue(value) {
    if (value === 'N5')
        return ['N5'];
    if (value === 'N4')
        return ['N4'];
    if (value === 'N3')
        return ['N3'];
    if (value === 'N2')
        return ['N2'];
    if (value === 'N5-N3')
        return ['N5', 'N4', 'N3'];
    if (value === 'ALL')
        return ['N5', 'N4', 'N3', 'N2'];
    return ['N3'];
}
function filterByLevels(kanji, levels) {
    return kanji.filter((k) => levels.includes(k.level));
}
function kanjiByLevelMap(kanji) {
    const map = {};
    for (const k of kanji) {
        if (!map[k.level])
            map[k.level] = [];
        map[k.level].push(k);
    }
    return map;
}
function applyBuildMeta(win, doc) {
    const el = doc.getElementById('build-meta');
    if (!el || !BUILD_META)
        return;
    el.textContent = formatBuildLabel(BUILD_META.hash, BUILD_META.datetimeIso);
}
function showPhase(doc, phase) {
    const loading = doc.getElementById('app-loading');
    if (loading)
        loading.hidden = true;
    const intro = doc.getElementById('test-intro');
    const question = doc.getElementById('test-question');
    const results = doc.getElementById('test-results');
    if (intro)
        intro.classList.toggle('app-view--hidden', phase !== 'intro');
    if (question)
        question.classList.toggle('app-view--hidden', phase !== 'question');
    if (results)
        results.classList.toggle('app-view--hidden', phase !== 'results');
}
function getTypeLabel(type) {
    switch (type) {
        case 'kanji-to-meaning': return 'Kanji → Meaning';
        case 'meaning-to-kanji': return 'Meaning → Kanji';
        case 'kanji-to-reading': return 'Kanji → Reading';
        case 'reading-to-kanji': return 'Reading → Kanji';
        default: return 'Question';
    }
}
function bootstrapTestApp(allKanji, win, doc) {
    const themeToggle = doc.getElementById('theme-toggle');
    const navToggle = doc.getElementById('nav-toggle');
    const navDrawer = doc.getElementById('nav-drawer');
    const navClose = doc.getElementById('nav-close');
    initTheme(win, doc, themeToggle);
    function openNav() {
        if (!navDrawer || !navToggle)
            return;
        navDrawer.classList.add('nav-drawer--open');
        navToggle.setAttribute('aria-expanded', 'true');
    }
    function closeNav() {
        if (!navDrawer || !navToggle)
            return;
        navDrawer.classList.remove('nav-drawer--open');
        navToggle.setAttribute('aria-expanded', 'false');
    }
    function toggleNav() {
        if (!navDrawer || !navToggle)
            return;
        if (navDrawer.classList.contains('nav-drawer--open')) {
            closeNav();
        }
        else {
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
    let perKanjiProgress = {};
    try {
        const raw = win.localStorage.getItem(PROGRESS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.perKanji && typeof parsed.perKanji === 'object') {
                perKanjiProgress = parsed.perKanji;
            }
        }
    }
    catch {
        // ignore
    }
    // Level selector
    const levelSelect = doc.getElementById('test-level-select');
    // Restore persisted level
    let storedLevel = null;
    try {
        storedLevel = win.localStorage.getItem(LEVEL_STORAGE_KEY);
    }
    catch { /* ignore */ }
    if (storedLevel && levelSelect) {
        const valid = Array.from(levelSelect.options).some((o) => o.value === storedLevel);
        if (valid)
            levelSelect.value = storedLevel;
    }
    function getSelectedLevels() {
        return levelsFromSelectValue(levelSelect ? levelSelect.value : 'N3');
    }
    function filteredKanji() {
        return filterByLevels(allKanji, getSelectedLevels());
    }
    const nowMs = Date.now();
    let currentFiltered = filteredKanji();
    let dueKanji = getDueKanji(currentFiltered, perKanjiProgress, nowMs);
    let state = createTestSession(dueKanji, kanjiByLevelMap(currentFiltered));
    // DOM elements
    const startBtn = doc.getElementById('test-start');
    const dueCountEl = doc.getElementById('test-due-count');
    const qTypeEl = doc.getElementById('test-q-type');
    const qProgressEl = doc.getElementById('test-q-progress');
    const promptEl = doc.getElementById('test-prompt');
    const choicesEl = doc.getElementById('test-choices');
    const nextBtn = doc.getElementById('test-next');
    const scoreEl = doc.getElementById('test-score');
    const scoreDisplayEl = doc.getElementById('test-score-display');
    const reviewSection = doc.getElementById('test-review-section');
    const reviewList = doc.getElementById('test-review-list');
    const retakeBtn = doc.getElementById('test-retake');
    const kanjiDetailEl = doc.getElementById('test-kanji-detail');
    const tts = createTtsApi(win);
    // Build lookup map: kanjiId → Kanji
    const kanjiById = {};
    for (const k of allKanji)
        kanjiById[k.id] = k;
    const choiceBtns = choicesEl
        ? Array.from(choicesEl.querySelectorAll('.test-choice'))
        : [];
    let answered = false;
    function showKanjiDetail(kanjiId) {
        if (!kanjiDetailEl)
            return;
        const k = kanjiById[kanjiId];
        if (!k) {
            kanjiDetailEl.classList.remove('test-kanji-detail--visible');
            return;
        }
        const parts = [];
        if (k.meanings?.length) {
            parts.push(`<div class="test-kanji-detail__row"><span>${k.meanings.join(', ')}</span></div>`);
        }
        if (k.onyomi?.length) {
            parts.push(`<div class="test-kanji-detail__row"><span class="test-kanji-detail__label">On'yomi</span><span>${k.onyomi.join(', ')}</span></div>`);
        }
        if (k.kunyomi?.length) {
            parts.push(`<div class="test-kanji-detail__row"><span class="test-kanji-detail__label">Kun'yomi</span><span>${k.kunyomi.join(', ')}</span></div>`);
        }
        if (k.example?.sentence) {
            const speakHtml = tts.available
                ? `<button type="button" class="button button--ghost button--small test-speak-example" aria-label="Speak example">🔊</button>`
                : '';
            parts.push(`<div class="test-kanji-detail__example">${k.example.sentence} ${speakHtml}<br>${k.example.reading}<br>${k.example.translation}</div>`);
        }
        kanjiDetailEl.innerHTML = parts.join('');
        // Wire speak button
        const speakBtn = kanjiDetailEl.querySelector('.test-speak-example');
        if (speakBtn) {
            speakBtn.addEventListener('click', () => tts.speakExample(k));
        }
        kanjiDetailEl.classList.add('test-kanji-detail--visible');
    }
    function hideKanjiDetail() {
        if (!kanjiDetailEl)
            return;
        kanjiDetailEl.innerHTML = '';
        kanjiDetailEl.classList.remove('test-kanji-detail--visible');
    }
    // Intro
    function renderIntro() {
        showPhase(doc, 'intro');
        const qCount = state.questions.length;
        if (dueCountEl) {
            if (qCount === 0) {
                dueCountEl.textContent = 'No kanji are due for review right now. Come back later!';
                if (startBtn)
                    startBtn.disabled = true;
            }
            else {
                dueCountEl.textContent = `${dueKanji.length} kanji due · ${qCount} questions`;
                if (startBtn)
                    startBtn.disabled = false;
            }
        }
    }
    // Question
    function renderQuestion() {
        showPhase(doc, 'question');
        answered = false;
        hideKanjiDetail();
        if (nextBtn)
            nextBtn.disabled = true;
        const q = state.questions[state.currentQuestionIndex];
        if (!q)
            return;
        if (qTypeEl)
            qTypeEl.textContent = getTypeLabel(q.type);
        if (qProgressEl)
            qProgressEl.textContent = `${state.currentQuestionIndex + 1} / ${state.questions.length}`;
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
    function handleChoice(chosenIndex) {
        if (answered)
            return;
        if (state.phase !== 'question')
            return;
        state = answerQuestion(state, chosenIndex);
        answered = true;
        const q = state.questions[state.currentQuestionIndex];
        for (let i = 0; i < choiceBtns.length; i++) {
            choiceBtns[i].disabled = true;
            if (i === q.correctIndex) {
                choiceBtns[i].classList.add('test-choice--correct');
            }
            else if (i === chosenIndex) {
                choiceBtns[i].classList.add('test-choice--wrong');
            }
        }
        if (nextBtn)
            nextBtn.disabled = false;
        showKanjiDetail(q.kanjiId);
    }
    // Results
    function renderResults() {
        showPhase(doc, 'results');
        const { correct, total, percentage } = computeScore(state);
        if (scoreEl)
            scoreEl.textContent = `${correct} / ${total}`;
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
                    li.appendChild(doc.createTextNode(' → '));
                    li.appendChild(correct);
                    li.appendChild(doc.createTextNode(' (you: '));
                    li.appendChild(chosen);
                    li.appendChild(doc.createTextNode(')'));
                    reviewList.appendChild(li);
                }
            }
            else {
                reviewSection.style.display = 'none';
            }
        }
        // Batch SRS update
        const grades = testResultsToSrsGrades(state);
        const now = Date.now();
        let updated = false;
        for (const [kanjiId, grade] of Object.entries(grades)) {
            const prev = perKanjiProgress[kanjiId] || {};
            const srsNext = updateSrsState(prev, grade, now);
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
            }
            catch {
                // ignore
            }
        }
    }
    function render() {
        switch (state.phase) {
            case 'intro':
                renderIntro();
                break;
            case 'question':
                renderQuestion();
                break;
            case 'results':
                renderResults();
                break;
        }
    }
    // Event handlers
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (state.questions.length === 0)
                return;
            state = { ...state, phase: 'question' };
            render();
        });
    }
    for (const btn of choiceBtns) {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx ?? '', 10);
            if (!Number.isNaN(idx))
                handleChoice(idx);
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (!answered)
                return;
            state = nextQuestion(state);
            render();
        });
    }
    if (retakeBtn) {
        retakeBtn.addEventListener('click', () => {
            const freshNow = Date.now();
            currentFiltered = filteredKanji();
            const freshDue = getDueKanji(currentFiltered, perKanjiProgress, freshNow);
            state = createTestSession(freshDue, kanjiByLevelMap(currentFiltered));
            state = { ...state, phase: state.questions.length > 0 ? 'question' : 'intro' };
            render();
        });
    }
    if (levelSelect) {
        levelSelect.addEventListener('change', () => {
            try {
                win.localStorage.setItem(LEVEL_STORAGE_KEY, levelSelect.value);
            }
            catch { /* ignore */ }
            currentFiltered = filteredKanji();
            dueKanji = getDueKanji(currentFiltered, perKanjiProgress, Date.now());
            state = createTestSession(dueKanji, kanjiByLevelMap(currentFiltered));
            render();
        });
    }
    // Keyboard shortcuts
    doc.addEventListener('keydown', (evt) => {
        const tag = evt.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
            return;
        if (evt.ctrlKey || evt.metaKey || evt.altKey)
            return;
        if (state.phase === 'intro') {
            if (evt.key === ' ' || evt.key === 'Enter') {
                evt.preventDefault();
                if (startBtn && !startBtn.disabled)
                    startBtn.click();
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
                if (nextBtn && !nextBtn.disabled)
                    nextBtn.click();
            }
            return;
        }
        if (state.phase === 'results') {
            if (evt.key === ' ' || evt.key === 'Enter') {
                evt.preventDefault();
                if (retakeBtn)
                    retakeBtn.click();
            }
        }
    });
    render();
}
function showApp(doc) {
    const loading = doc.getElementById('app-loading');
    if (loading)
        loading.hidden = true;
}
async function start() {
    const win = window;
    const doc = document;
    let storage = null;
    try {
        storage = win.localStorage;
    }
    catch { /* private browsing */ }
    const cached = getCachedKanji(storage);
    if (cached && cached.length > 0) {
        bootstrapTestApp(cached, win, doc);
        showApp(doc);
        loadJlptKanji(['N5', 'N4', 'N3', 'N2'])
            .then((fresh) => { setCachedKanji(storage, fresh); })
            .catch(() => { });
        return;
    }
    try {
        const allKanji = await loadJlptKanji(['N5', 'N4', 'N3', 'N2']);
        setCachedKanji(storage, allKanji);
        bootstrapTestApp(allKanji, win, doc);
    }
    catch (err) {
        console.error('Failed to load JLPT kanji, using sample data.', err);
        bootstrapTestApp(SAMPLE_KANJI, win, doc);
    }
    showApp(doc);
}
registerSw(window);
applyBuildMeta(window, document);
initPageShortcuts(window, document, '../');
start();
