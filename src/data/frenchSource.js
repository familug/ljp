import { ALL_FRENCH } from './frenchVocab.js';
export function loadFrenchVocab(levels) {
    const levelSet = new Set(levels);
    return ALL_FRENCH.filter((k) => levelSet.has(k.level));
}
