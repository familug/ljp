const JAPANESE = {
    id: 'ja',
    label: 'Japanese',
    flag: '\u{1F1EF}\u{1F1F5}',
    levels: ['N5', 'N4', 'N3', 'N2'],
    defaultLevel: 'N3',
    ttsLang: 'ja',
    storagePrefix: 'jlpt-kanji',
    pages: ['trainer', 'kana', 'draw', 'test', 'settings', 'faq'],
    questionTypes: ['kanji-to-meaning', 'meaning-to-kanji', 'kanji-to-reading', 'reading-to-kanji'],
    wordLabel: 'kanji',
    subtitle: 'Focused kanji practice with readings, examples, and TTS.'
};
const FRENCH = {
    id: 'fr',
    label: 'French',
    flag: '\u{1F1EB}\u{1F1F7}',
    levels: ['A1', 'A2', 'B1', 'B2'],
    defaultLevel: 'A1',
    ttsLang: 'fr',
    storagePrefix: 'fr-vocab',
    pages: ['trainer', 'test', 'settings', 'faq'],
    questionTypes: ['kanji-to-meaning', 'meaning-to-kanji'],
    wordLabel: 'words',
    subtitle: 'French vocabulary practice with meanings and TTS.'
};
export const LANGUAGES = {
    ja: JAPANESE,
    fr: FRENCH
};
const LANG_STORAGE_KEY = 'language-trainer-lang-v1';
export function getStoredLanguage(win) {
    try {
        const raw = win.localStorage.getItem(LANG_STORAGE_KEY);
        if (raw === 'ja' || raw === 'fr')
            return raw;
    }
    catch {
        // ignore
    }
    return 'ja';
}
export function setStoredLanguage(win, lang) {
    try {
        win.localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
    catch {
        // ignore
    }
}
export function storageKey(config, suffix) {
    return `${config.storagePrefix}-${suffix}`;
}
export function nextLanguage(current) {
    return current === 'ja' ? 'fr' : 'ja';
}
