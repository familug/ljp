import { createSession, setLevels, markKnown, markUnknown, getAccuracy, normalizeLevelPreference } from '../core/quizCore.js';
import { updateSrsState, normalizeSrsState } from '../core/srs.js';
const PROGRESS_KEY = 'jlpt-kanji-progress-v1';
const LEVEL_STORAGE_KEY = 'jlpt-level-choice-v1';
function createTtsApi(win) {
    if (!win || !('speechSynthesis' in win)) {
        return {
            available: false,
            speakKanji: () => { },
            speakExample: () => { },
            speakExampleTranslation: () => { }
        };
    }
    const synth = win.speechSynthesis;
    function pickJapaneseVoice() {
        const voices = synth.getVoices();
        if (!voices || !voices.length)
            return null;
        const ja = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
        return ja || voices[0];
    }
    function pickEnglishVoice() {
        const voices = synth.getVoices();
        if (!voices || !voices.length)
            return null;
        const en = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
        return en || voices[0];
    }
    function speakJapanese(text) {
        if (!text)
            return;
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = pickJapaneseVoice();
        if (voice)
            utterance.voice = voice;
        utterance.lang = (voice && voice.lang) || 'ja-JP';
        synth.cancel();
        synth.speak(utterance);
    }
    function speakEnglish(text) {
        if (!text)
            return;
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = pickEnglishVoice();
        if (voice)
            utterance.voice = voice;
        utterance.lang = (voice && voice.lang) || 'en-US';
        synth.cancel();
        synth.speak(utterance);
    }
    return {
        available: true,
        speakKanji(kanji) {
            if (!kanji)
                return;
            const primaryReading = (kanji.kunyomi && kanji.kunyomi[0]) ||
                (kanji.onyomi && kanji.onyomi[0]) ||
                kanji.kanji;
            speakJapanese(primaryReading);
        },
        speakExample(kanji) {
            if (!kanji || !kanji.example)
                return;
            speakJapanese(kanji.example.sentence || kanji.example.reading);
        },
        speakExampleTranslation(kanji) {
            if (!kanji || !kanji.example)
                return;
            speakEnglish(kanji.example.translation || '');
        }
    };
}
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
export function initTheme(win, doc, toggleButton) {
    const root = doc.documentElement;
    const storageKey = 'kanji-trainer-theme';
    function getSystemPrefersDark() {
        return win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    function readStoredTheme() {
        try {
            const value = win.localStorage.getItem(storageKey);
            return value === 'light' || value === 'dark' ? value : null;
        }
        catch {
            return null;
        }
    }
    function writeStoredTheme(theme) {
        try {
            win.localStorage.setItem(storageKey, theme);
        }
        catch {
            // ignore
        }
    }
    function applyTheme(theme) {
        root.dataset.theme = theme;
        if (toggleButton) {
            toggleButton.textContent = theme === 'dark' ? '🌙' : '☀️';
            toggleButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
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
    const toggleReadingsBtn = doc.getElementById('toggle-readings');
    const markKnownBtn = doc.getElementById('mark-known');
    const markUnknownBtn = doc.getElementById('mark-unknown');
    const nextCardBtn = doc.getElementById('next-card');
    const speakKanjiBtn = doc.getElementById('speak-kanji');
    const speakExampleBtn = doc.getElementById('speak-example');
    const speakExampleEnBtn = doc.getElementById('speak-example-en');
    const writeToggleBtn = doc.getElementById('write-toggle');
    const writePeekBtn = doc.getElementById('write-peek');
    const writeSection = doc.getElementById('write-section');
    const writeCanvas = doc.getElementById('write-canvas');
    const writeClearBtn = doc.getElementById('write-clear');
    const writeCheckBtn = doc.getElementById('write-check');
    const writeFeedback = doc.getElementById('write-feedback');
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
    function readStoredLevelValue() {
        try {
            return win.localStorage.getItem(LEVEL_STORAGE_KEY);
        }
        catch {
            return null;
        }
    }
    function writeStoredLevelValue(value) {
        try {
            win.localStorage.setItem(LEVEL_STORAGE_KEY, value);
        }
        catch {
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
    const initialLevels = levelsFromSelectValue(initialSelectValue);
    let state = createSession(allKanji, { levels: initialLevels });
    let perKanjiProgress = {};
    let detailsOpen = false;
    let writing = false;
    let peekKanji = false;
    let clearWriteCanvas = null;
    function updateWritingUi(currentState) {
        if (!cardKanji || !writeToggleBtn)
            return;
        const hasKanji = currentState && currentState.pool?.length > 0 && currentState.currentIndex >= 0;
        // Write section + main kanji visibility
        if (writeSection) {
            if (writing) {
                writeSection.classList.add('card__section-body--visible');
                writeSection.classList.remove('card__section-body--hidden');
            }
            else {
                writeSection.classList.add('card__section-body--hidden');
                writeSection.classList.remove('card__section-body--visible');
            }
        }
        if (writing && !peekKanji) {
            cardKanji.classList.add('card__kanji--hidden');
        }
        else {
            cardKanji.classList.remove('card__kanji--hidden');
        }
        // Details and example sections
        if (detailsSection) {
            if (writing) {
                detailsSection.classList.add('card__section--hidden');
            }
            else {
                detailsSection.classList.remove('card__section--hidden');
            }
        }
        if (exampleSection) {
            if (writing) {
                exampleSection.classList.add('card__section--hidden');
            }
            else {
                exampleSection.classList.remove('card__section--hidden');
            }
        }
        // Buttons
        writeToggleBtn.textContent = writing ? 'Done' : 'Write';
        writeToggleBtn.disabled = !hasKanji;
        if (writePeekBtn) {
            writePeekBtn.textContent = peekKanji ? 'Hide' : 'Peek';
            writePeekBtn.disabled = !writing;
            writePeekBtn.hidden = !writing || !hasKanji;
        }
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
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
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
        }
        catch {
            // ignore
        }
    }
    function getCurrentKanji(currentState) {
        const { pool, currentIndex } = currentState;
        if (!pool.length || currentIndex < 0)
            return null;
        return pool[currentIndex];
    }
    function pickNextIndex(currentState, nowMs = Date.now()) {
        const { pool } = currentState;
        if (!pool.length)
            return -1;
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
        if (toggleReadingsBtn)
            toggleReadingsBtn.disabled = !hasKanji;
        if (markKnownBtn)
            markKnownBtn.disabled = !hasKanji;
        if (markUnknownBtn)
            markUnknownBtn.disabled = !hasKanji;
        if (nextCardBtn)
            nextCardBtn.disabled = !hasKanji;
        if (!tts.available) {
            if (speakKanjiBtn) {
                speakKanjiBtn.disabled = true;
                speakKanjiBtn.title = 'Text-to-speech is not available in this browser.';
            }
            if (speakExampleBtn) {
                speakExampleBtn.disabled = true;
                speakExampleBtn.title = 'Text-to-speech is not available in this browser.';
            }
            if (speakExampleEnBtn)
                speakExampleEnBtn.disabled = true;
        }
        else {
            if (speakKanjiBtn)
                speakKanjiBtn.disabled = !hasKanji;
            if (speakExampleBtn)
                speakExampleBtn.disabled = !hasKanji;
            if (speakExampleEnBtn)
                speakExampleEnBtn.disabled = !hasKanji;
        }
        if (!hasKanji) {
            if (cardLevel)
                cardLevel.textContent = 'NO DATA';
            if (cardIndex)
                cardIndex.textContent = '';
            if (cardKanji)
                cardKanji.textContent = '—';
            if (cardReadings)
                cardReadings.textContent = 'No kanji available for this selection.';
            if (cardMeanings)
                cardMeanings.textContent = '';
            if (cardExampleSentence)
                cardExampleSentence.textContent = '';
            if (cardExampleReading)
                cardExampleReading.textContent = '';
            if (cardExampleTranslation)
                cardExampleTranslation.textContent = '';
            if (statsSeen)
                statsSeen.textContent = 'Seen: 0';
            if (statsKnown)
                statsKnown.textContent = 'Known: 0 (0%)';
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
                toggleReadingsBtn.textContent = 'Show';
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
        if (cardLevel)
            cardLevel.textContent = kanji.level || '';
        if (cardIndex)
            cardIndex.textContent = indexLabel;
        if (cardKanji)
            cardKanji.textContent = kanji.kanji || '';
        const readingsPieces = [];
        if (kanji.onyomi && kanji.onyomi.length) {
            readingsPieces.push(`音: ${kanji.onyomi.join('、 ')}`);
        }
        if (kanji.kunyomi && kanji.kunyomi.length) {
            readingsPieces.push(`訓: ${kanji.kunyomi.join('、 ')}`);
        }
        if (cardReadings)
            cardReadings.textContent = readingsPieces.join('　');
        if (cardMeanings)
            cardMeanings.textContent = (kanji.meanings || []).join(', ');
        if (kanji.example) {
            if (cardExampleSentence)
                cardExampleSentence.textContent = kanji.example.sentence || '';
            if (cardExampleReading)
                cardExampleReading.textContent = kanji.example.reading || '';
            if (cardExampleTranslation)
                cardExampleTranslation.textContent = kanji.example.translation || '';
        }
        else {
            if (cardExampleSentence)
                cardExampleSentence.textContent = '';
            if (cardExampleReading)
                cardExampleReading.textContent = '';
            if (cardExampleTranslation)
                cardExampleTranslation.textContent = '';
        }
        if (cardDetails && toggleReadingsBtn) {
            if (detailsOpen) {
                cardDetails.classList.add('card__section-body--visible');
                cardDetails.classList.remove('card__section-body--hidden');
                toggleReadingsBtn.textContent = 'Hide';
            }
            else {
                cardDetails.classList.add('card__section-body--hidden');
                cardDetails.classList.remove('card__section-body--visible');
                toggleReadingsBtn.textContent = 'Show';
            }
        }
        const accuracy = getAccuracy(currentState);
        if (statsSeen)
            statsSeen.textContent = `Seen: ${currentState.stats.seen}`;
        if (statsKnown)
            statsKnown.textContent = `Known: ${currentState.stats.known} (${accuracy.toFixed(0)}%)`;
        updateWritingUi(state);
    }
    if (levelSelect) {
        levelSelect.addEventListener('change', () => {
            const levels = levelsFromSelectValue(levelSelect.value);
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
            writing = false;
            peekKanji = false;
            detailsOpen = false;
            if (clearWriteCanvas) {
                clearWriteCanvas();
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
            if (!pool.length || currentIndex < 0)
                return;
            tts.speakKanji(pool[currentIndex]);
        });
    }
    if (speakExampleBtn && tts.available) {
        speakExampleBtn.addEventListener('click', () => {
            const { pool, currentIndex } = state;
            if (!pool.length || currentIndex < 0)
                return;
            tts.speakExample(pool[currentIndex]);
        });
    }
    if (speakExampleEnBtn && tts.available) {
        speakExampleEnBtn.addEventListener('click', () => {
            const { pool, currentIndex } = state;
            if (!pool.length || currentIndex < 0)
                return;
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
                if (!current?.kanji)
                    return;
                ctx.save();
                ctx.fillStyle = 'rgba(249, 250, 251, 0.22)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '140px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                if (typeof ctx.filter !== 'undefined') {
                    ctx.filter = 'blur(4px)';
                }
                ctx.fillText(current.kanji, size / 2, size / 2);
                ctx.restore();
            }
            clearWriteCanvas = function clearWriteCanvasImpl() {
                ctx.fillStyle = '#020617';
                ctx.fillRect(0, 0, size, size);
                drawGuideKanji();
                writeFeedback.textContent = '';
                hasInk = false;
            };
            clearWriteCanvas();
            function getPos(evt) {
                const rect = writeCanvas.getBoundingClientRect();
                const x = evt.clientX - rect.left;
                const y = evt.clientY - rect.top;
                const scaleX = writeCanvas.width / rect.width;
                const scaleY = writeCanvas.height / rect.height;
                return {
                    x: x * scaleX,
                    y: y * scaleY
                };
            }
            writeCanvas.addEventListener('pointerdown', (evt) => {
                drawing = true;
                hasInk = true;
                writeCanvas.setPointerCapture(evt.pointerId);
                const { x, y } = getPos(evt);
                detailsOpen = false;
                render(state);
                ctx.beginPath();
                ctx.moveTo(x, y);
            });
            function stopDrawing(evt) {
                if (!drawing)
                    return;
                drawing = false;
                if (evt && writeCanvas.hasPointerCapture(evt.pointerId)) {
                    writeCanvas.releasePointerCapture(evt.pointerId);
                }
            }
            writeCanvas.addEventListener('pointermove', (evt) => {
                if (!drawing)
                    return;
                const { x, y } = getPos(evt);
                ctx.lineTo(x, y);
                ctx.stroke();
            });
            writeCanvas.addEventListener('pointerup', stopDrawing);
            writeCanvas.addEventListener('pointercancel', stopDrawing);
            writeCanvas.addEventListener('pointerleave', stopDrawing);
            writeClearBtn.addEventListener('click', () => {
                if (clearWriteCanvas) {
                    clearWriteCanvas();
                }
            });
            function scoreAgainstCurrentKanji() {
                const current = getCurrentKanji(state);
                if (!current || !current.kanji) {
                    writeFeedback.textContent = 'No kanji selected.';
                    return;
                }
                if (!hasInk) {
                    writeFeedback.textContent = 'Draw the kanji above, then tap Check.';
                    return;
                }
                const targetSize = 32;
                const tmpCanvas = doc.createElement('canvas');
                tmpCanvas.width = targetSize;
                tmpCanvas.height = targetSize;
                const tmpCtx = tmpCanvas.getContext('2d');
                if (!tmpCtx) {
                    writeFeedback.textContent = 'Drawing not supported in this browser.';
                    return;
                }
                tmpCtx.drawImage(writeCanvas, 0, 0, targetSize, targetSize);
                const userImage = tmpCtx.getImageData(0, 0, targetSize, targetSize);
                const userData = userImage.data;
                const glyphCanvas = doc.createElement('canvas');
                glyphCanvas.width = targetSize;
                glyphCanvas.height = targetSize;
                const glyphCtx = glyphCanvas.getContext('2d');
                if (!glyphCtx) {
                    writeFeedback.textContent = 'Drawing not supported in this browser.';
                    return;
                }
                glyphCtx.fillStyle = '#020617';
                glyphCtx.fillRect(0, 0, targetSize, targetSize);
                glyphCtx.fillStyle = '#f9fafb';
                glyphCtx.textAlign = 'center';
                glyphCtx.textBaseline = 'middle';
                glyphCtx.font =
                    '26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                glyphCtx.fillText(current.kanji, targetSize / 2, targetSize / 2);
                const glyphImage = glyphCtx.getImageData(0, 0, targetSize, targetSize);
                const glyphData = glyphImage.data;
                let error = 0;
                let energy = 0;
                for (let i = 0; i < userData.length; i += 4) {
                    const ur = userData[i];
                    const ug = userData[i + 1];
                    const ub = userData[i + 2];
                    const gr = glyphData[i];
                    const gg = glyphData[i + 1];
                    const gb = glyphData[i + 2];
                    const u = (ur + ug + ub) / (3 * 255);
                    const g = (gr + gg + gb) / (3 * 255);
                    const diff = u - g;
                    error += diff * diff;
                    energy += u * u;
                }
                const normalized = energy > 0 ? error / energy : Infinity;
                let scoreValue;
                if (!isFinite(normalized)) {
                    scoreValue = 0;
                }
                else {
                    const maxN = 3;
                    const clamped = Math.min(normalized, maxN);
                    scoreValue = Math.round(((maxN - clamped) / maxN) * 100);
                    if (scoreValue < 0)
                        scoreValue = 0;
                    if (scoreValue > 100)
                        scoreValue = 100;
                }
                let qualText;
                if (!isFinite(normalized)) {
                    qualText = 'Draw using more of the box and with a solid stroke, then try again.';
                }
                else if (normalized < 1.2) {
                    qualText = 'Looks very close – great job!';
                }
                else if (normalized < 2.5) {
                    qualText = 'Close enough. The overall shape is similar – good practice.';
                }
                else {
                    qualText =
                        'This looks quite different from the printed kanji. Try to center it and use more of the box.';
                }
                writeFeedback.textContent = `Stroke score: ${scoreValue}/100. ${qualText}`;
            }
            writeCheckBtn.addEventListener('click', scoreAgainstCurrentKanji);
        }
    }
    if (writeToggleBtn && writeSection && writeCanvas) {
        writeToggleBtn.addEventListener('click', () => {
            const current = getCurrentKanji(state);
            if (!current)
                return;
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
    if (writePeekBtn && cardKanji) {
        writePeekBtn.addEventListener('click', () => {
            if (!writing)
                return;
            peekKanji = !peekKanji;
            updateWritingUi(state);
        });
    }
    render(state);
}
