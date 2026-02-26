import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KANJI_URL =
  'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json';

const TATOEBA_SEARCH_BASE =
  'https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&orphans=no&unapproved=no&sort=random&limit=1&query=';

function jlptNumberToLevel(jlptNew) {
  if (jlptNew === 5) return 'N5';
  if (jlptNew === 4) return 'N4';
  if (jlptNew === 3) return 'N3';
  if (jlptNew === 2) return 'N2';
  return null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function fetchExampleForKanji(kanji) {
  const url = TATOEBA_SEARCH_BASE + encodeURIComponent(kanji);
  const data = await fetchJson(url);

  if (!data.results || data.results.length === 0) return null;

  const sentence = data.results[0];
  const jp = sentence.text;

  const firstTransGroup = sentence.translations && sentence.translations[0];
  const firstEng = firstTransGroup && firstTransGroup[0];
  const en = firstEng ? firstEng.text : '';

  return {
    sentence: jp,
    reading: '',
    translation: en
  };
}

async function main() {
  console.log('Fetching kanji list...');
  const kanjiData = await fetchJson(KANJI_URL);

  const targetKanji = new Set();

  for (const [kanji, entry] of Object.entries(kanjiData)) {
    const level = jlptNumberToLevel(entry.jlpt_new);
    if (!level) continue;
    targetKanji.add(kanji);
  }

  console.log(`Found ${targetKanji.size} JLPT N5–N2 kanji.`);

  const overrides = {};
  let count = 0;

  const delayMs = 500;

  for (const kanji of targetKanji) {
    count += 1;
    console.log(`[${count}/${targetKanji.size}] Fetching example for ${kanji}...`);

    try {
      const ex = await fetchExampleForKanji(kanji);
      if (ex) {
        overrides[kanji] = ex;
      } else {
        console.warn(`  No example found for ${kanji}`);
      }
    } catch (err) {
      console.warn(`  Error for ${kanji}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  const header = `// Auto-generated from Tatoeba API
// Source license: CC BY 2.0 FR (Tatoeba.org)
// Do not edit by hand; re-run scripts/fetchTatoebaExamples.mjs instead.

export const EXAMPLE_OVERRIDES = `;

  const body = JSON.stringify(overrides, null, 2);
  const out = `${header}${body};\n`;

  const outPath = path.resolve(__dirname, '../src/data/exampleOverrides.js');
  await fs.writeFile(outPath, out, 'utf8');
  console.log(`Wrote ${Object.keys(overrides).length} example sentences to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

