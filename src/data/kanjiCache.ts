/**
 * In-memory / localStorage cache for the JLPT kanji list so repeat loads are instant.
 * Shell owns storage; this module uses the provided storage interface.
 */

const DEFAULT_CACHE_KEY = 'jlpt-kanji-cache-v1';

export function getCachedKanji(storage: Storage | null, cacheKey?: string): unknown[] | null {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(cacheKey ?? DEFAULT_CACHE_KEY);
    if (raw == null || raw === '') return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export function setCachedKanji(storage: Storage | null, list: unknown[], cacheKey?: string): void {
  if (!storage || typeof storage.setItem !== 'function') return;
  if (!Array.isArray(list)) return;
  try {
    storage.setItem(cacheKey ?? DEFAULT_CACHE_KEY, JSON.stringify(list));
  } catch {
    // quota or disabled; ignore
  }
}
