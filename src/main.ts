import type { Kanji } from './types.js';
import { bootstrapKanjiApp } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { getCachedKanji, setCachedKanji } from './data/kanjiCache.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';
import { BUILD_META, formatBuildLabel } from './buildMeta.js';
import { registerSw } from './registerSw.js';

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
  let storage: Storage | null = null;
  try { storage = win.localStorage; } catch { /* private browsing */ }
  const cached = getCachedKanji(storage) as Kanji[] | null;

  if (cached && cached.length > 0) {
    bootstrapKanjiApp(cached, win, doc);
    showApp(win, doc);
    loadJlptKanji(['N5', 'N4', 'N3', 'N2'])
      .then((fresh) => {
        setCachedKanji(storage, fresh);
      })
      .catch(() => {});
    return;
  }

  try {
    const allKanji = await loadJlptKanji(['N5', 'N4', 'N3', 'N2']);
    setCachedKanji(storage, allKanji);
    bootstrapKanjiApp(allKanji, win, doc);
  } catch (err) {
    console.error('Failed to load full JLPT kanji list, using sample data instead.', err);
    bootstrapKanjiApp(SAMPLE_KANJI, win, doc);
  }
  showApp(win, doc);
}

registerSw(window);
applyBuildMeta(window, document);
start();
