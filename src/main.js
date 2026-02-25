import { bootstrapKanjiApp } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';

async function start() {
  try {
    const allKanji = await loadJlptKanji(['N3', 'N2']);
    bootstrapKanjiApp(allKanji, window, document);
  } catch (err) {
    console.error('Failed to load full JLPT kanji list, using sample data instead.', err);
    bootstrapKanjiApp(SAMPLE_KANJI, window, document);
  }
}

start();

