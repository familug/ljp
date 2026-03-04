import type { Kanji } from './types.js';
import { bootstrapKanjiApp, initLangToggle, buildNavLinks, populateLevelSelect } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { getCachedKanji, setCachedKanji } from './data/kanjiCache.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';
import { BUILD_META, formatBuildLabel } from './buildMeta.js';
import { registerSw } from './registerSw.js';
import { getStoredLanguage, LANGUAGES, storageKey } from './core/language.js';
import { loadFrenchVocab } from './data/frenchSource.js';

function applyBuildMeta(win: Window, doc: Document): void {
  const el = doc.getElementById('build-meta');
  if (!el || !BUILD_META) return;
  el.textContent = formatBuildLabel(BUILD_META.hash, BUILD_META.datetimeIso);
}

function showApp(win: Window, doc: Document): void {
  const loading = doc.getElementById('app-loading');
  const view = doc.getElementById('view-kanji');
  if (loading) loading.hidden = true;
  if (view) view.classList.remove('app-view--hidden');
}

async function start(): Promise<void> {
  const win = window;
  const doc = document;
  const langId = getStoredLanguage(win);
  const langConfig = LANGUAGES[langId];

  initLangToggle(win, doc, langConfig);
  buildNavLinks(doc, langConfig, './', 'trainer');

  // Update subtitle
  const subtitle = doc.querySelector('.app-subtitle');
  if (subtitle) subtitle.textContent = langConfig.subtitle;

  // Populate level select dynamically
  const levelSelect = doc.getElementById('level-select') as HTMLSelectElement | null;
  if (levelSelect) populateLevelSelect(levelSelect, langConfig, doc);

  let storage: Storage | null = null;
  try { storage = win.localStorage; } catch { /* private browsing */ }

  if (langId === 'fr') {
    const allFrench = loadFrenchVocab(langConfig.levels);
    bootstrapKanjiApp(allFrench, win, doc, langConfig);
    showApp(win, doc);
    return;
  }

  // Japanese: cache-first async load
  const cacheKey = storageKey(langConfig, 'cache-v1');
  const cached = getCachedKanji(storage, cacheKey) as Kanji[] | null;

  if (cached && cached.length > 0) {
    bootstrapKanjiApp(cached, win, doc, langConfig);
    showApp(win, doc);
    loadJlptKanji(['N5', 'N4', 'N3', 'N2'])
      .then((fresh) => {
        setCachedKanji(storage, fresh, cacheKey);
      })
      .catch(() => {});
    return;
  }

  try {
    const allKanji = await loadJlptKanji(['N5', 'N4', 'N3', 'N2']);
    setCachedKanji(storage, allKanji, cacheKey);
    bootstrapKanjiApp(allKanji, win, doc, langConfig);
  } catch (err) {
    console.error('Failed to load full JLPT kanji list, using sample data instead.', err);
    bootstrapKanjiApp(SAMPLE_KANJI, win, doc, langConfig);
  }
  showApp(win, doc);
}

registerSw(window);
applyBuildMeta(window, document);
start();
