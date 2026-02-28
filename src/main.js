import { bootstrapKanjiApp } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';
import { BUILD_META } from './buildMeta.js';

function applyBuildMeta(win, doc) {
  const el = doc.getElementById('build-meta');
  if (!el || !BUILD_META) return;
  const hash = BUILD_META.hash || 'dev';
  const datetime = BUILD_META.datetimeIso || '';
  const label = datetime ? `${hash} · ${datetime}` : hash;
  el.textContent = `Build ${label}`;
}

async function start() {
  try {
    const allKanji = await loadJlptKanji(['N5', 'N4', 'N3', 'N2']);
    bootstrapKanjiApp(allKanji, window, document);
  } catch (err) {
    console.error('Failed to load full JLPT kanji list, using sample data instead.', err);
    bootstrapKanjiApp(SAMPLE_KANJI, window, document);
  }
}

applyBuildMeta(window, document);
start();

