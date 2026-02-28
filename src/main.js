import { bootstrapKanjiApp } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { getCachedKanji, setCachedKanji } from './data/kanjiCache.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';
import { BUILD_META } from './buildMeta.js';
import { registerSw } from './registerSw.js';

function applyBuildMeta(win, doc) {
  const el = doc.getElementById('build-meta');
  if (!el || !BUILD_META) return;
  const hash = BUILD_META.hash || 'dev';
  const datetime = BUILD_META.datetimeIso || '';
  const label = datetime ? `${hash} · ${datetime}` : hash;
  el.textContent = `Build ${label}`;
}

function showApp(win, doc) {
  const loading = doc.getElementById('app-loading');
  const view = doc.getElementById('view-kanji');
  if (loading) loading.hidden = true;
  if (view) view.classList.remove('app-view--hidden');
}

async function start() {
  const win = window;
  const doc = document;
  const storage = win.localStorage || null;
  const cached = getCachedKanji(storage);

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

