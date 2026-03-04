import type { Kanji } from '../types.js';
import { ALL_FRENCH } from './frenchVocab.js';

export function loadFrenchVocab(levels: string[]): Kanji[] {
  const levelSet = new Set(levels);
  return ALL_FRENCH.filter((k) => levelSet.has(k.level));
}
