/**
 * In-memory / localStorage cache for the JLPT kanji list so repeat loads are instant.
 * Shell owns storage; this module uses the provided storage interface.
 */

const CACHE_KEY = 'jlpt-kanji-cache-v1';

/**
 * @param {Storage | null} storage - e.g. window.localStorage
 * @returns {Array<unknown> | null} Parsed kanji array or null if missing/invalid
 */
export function getCachedKanji(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (raw == null || raw === '') return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null} storage - e.g. window.localStorage
 * @param {Array<unknown>} list - Kanji array to store
 */
export function setCachedKanji(storage, list) {
  if (!storage || typeof storage.setItem !== 'function') return;
  if (!Array.isArray(list)) return;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // quota or disabled; ignore
  }
}
