import type { TestQuestionType } from '../types.js';

export type LanguageId = 'ja' | 'fr';

export interface LanguageConfig {
  id: LanguageId;
  label: string;
  flag: string;
  levels: string[];
  defaultLevel: string;
  ttsLang: string;
  storagePrefix: string;
  pages: string[];
  questionTypes: TestQuestionType[];
  wordLabel: string;
  subtitle: string;
}

const JAPANESE: LanguageConfig = {
  id: 'ja',
  label: 'Japanese',
  flag: '\u{1F1EF}\u{1F1F5}',
  levels: ['N5', 'N4', 'N3', 'N2'],
  defaultLevel: 'N3',
  ttsLang: 'ja',
  storagePrefix: 'jlpt-kanji',
  pages: ['trainer', 'kana', 'draw', 'test', 'settings'],
  questionTypes: ['kanji-to-meaning', 'meaning-to-kanji', 'kanji-to-reading', 'reading-to-kanji'],
  wordLabel: 'kanji',
  subtitle: 'Focused kanji practice with readings, examples, and TTS.'
};

const FRENCH: LanguageConfig = {
  id: 'fr',
  label: 'French',
  flag: '\u{1F1EB}\u{1F1F7}',
  levels: ['A1', 'A2', 'B1', 'B2'],
  defaultLevel: 'A1',
  ttsLang: 'fr',
  storagePrefix: 'fr-vocab',
  pages: ['trainer', 'test', 'settings'],
  questionTypes: ['kanji-to-meaning', 'meaning-to-kanji'],
  wordLabel: 'words',
  subtitle: 'French vocabulary practice with meanings and TTS.'
};

export const LANGUAGES: Record<LanguageId, LanguageConfig> = {
  ja: JAPANESE,
  fr: FRENCH
};

const LANG_STORAGE_KEY = 'language-trainer-lang-v1';

export function getStoredLanguage(win: Window): LanguageId {
  try {
    const raw = win.localStorage.getItem(LANG_STORAGE_KEY);
    if (raw === 'ja' || raw === 'fr') return raw;
  } catch {
    // ignore
  }
  return 'ja';
}

export function setStoredLanguage(win: Window, lang: LanguageId): void {
  try {
    win.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export function storageKey(config: LanguageConfig, suffix: string): string {
  return `${config.storagePrefix}-${suffix}`;
}

export function nextLanguage(current: LanguageId): LanguageId {
  return current === 'ja' ? 'fr' : 'ja';
}
