import { EXAMPLE_OVERRIDES } from './exampleOverrides.js';
const SOURCE_URL = 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json';
function jlptNumberToLevel(jlptNew) {
    if (jlptNew === 5)
        return 'N5';
    if (jlptNew === 4)
        return 'N4';
    if (jlptNew === 3)
        return 'N3';
    if (jlptNew === 2)
        return 'N2';
    return null;
}
function buildExample(kanji, onyomi, kunyomi) {
    const override = EXAMPLE_OVERRIDES[kanji];
    if (override) {
        return override;
    }
    const reading = (Array.isArray(kunyomi) && kunyomi[0]) ||
        (Array.isArray(onyomi) && onyomi[0]) ||
        null;
    const sentence = `${kanji}の意味を勉強します。`;
    const readingSentence = reading ? `${reading} の いみ を べんきょう します。` : '';
    const translation = `I study the meaning of ${kanji}.`;
    return {
        sentence,
        reading: readingSentence,
        translation
    };
}
export async function loadJlptKanji(levels = ['N5', 'N4', 'N3', 'N2']) {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch JLPT kanji data: ${response.status}`);
    }
    const raw = await response.json();
    const levelSet = new Set(levels);
    const result = [];
    for (const [kanji, entry] of Object.entries(raw)) {
        const level = jlptNumberToLevel(entry.jlpt_new ?? 0);
        if (!level || !levelSet.has(level))
            continue;
        const onyomi = Array.isArray(entry.readings_on) ? entry.readings_on : [];
        const kunyomi = Array.isArray(entry.readings_kun) ? entry.readings_kun : [];
        const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
        result.push({
            id: `${level}-${kanji}`,
            level,
            kanji,
            onyomi,
            kunyomi,
            meanings,
            example: buildExample(kanji, onyomi, kunyomi)
        });
    }
    return result;
}
