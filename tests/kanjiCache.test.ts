import assert from 'node:assert/strict';
import { getCachedKanji, setCachedKanji } from '../src/data/kanjiCache.js';

function testGetCachedKanjiMissing(): void {
  const storage = { getItem: () => null } as Storage;
  assert.equal(getCachedKanji(storage), null);
}

function testGetCachedKanjiInvalid(): void {
  const storage = { getItem: () => 'not json' } as Storage;
  assert.equal(getCachedKanji(storage), null);

  const empty = { getItem: () => '[]' } as Storage;
  assert.equal(getCachedKanji(empty), null, 'empty array is invalid');
}

function testSetAndGetCachedKanji(): void {
  const store: Record<string, string> = {};
  const storage = {
    getItem(key: string) {
      return store[key] ?? null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    }
  } as Storage;
  const list = [{ id: 'N3-学', kanji: '学' }];
  setCachedKanji(storage, list);
  const got = getCachedKanji(storage);
  assert.ok(Array.isArray(got));
  assert.equal(got!.length, 1);
  assert.equal((got![0] as { kanji: string }).kanji, '学');
}

function testSetCachedKanjiIgnoresNonArray(): void {
  const store: Record<string, string> = {};
  const storage = {
    getItem(k: string) {
      return store[k] ?? null;
    },
    setItem(k: string, v: string) {
      store[k] = v;
    }
  } as Storage;
  setCachedKanji(storage, null as unknown as unknown[]);
  setCachedKanji(storage, {} as unknown as unknown[]);
  assert.equal(storage.getItem('jlpt-kanji-cache-v1'), null);
}

function testGetCachedKanjiNullStorage(): void {
  assert.equal(getCachedKanji(null), null);
}

const tests: Array<[string, () => void]> = [
  ['getCachedKanji missing', testGetCachedKanjiMissing],
  ['getCachedKanji invalid', testGetCachedKanjiInvalid],
  ['set and get cached kanji', testSetAndGetCachedKanji],
  ['setCachedKanji ignores non-array', testSetCachedKanjiIgnoresNonArray],
  ['getCachedKanji null storage', testGetCachedKanjiNullStorage]
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}`);
    console.error(err);
  }
}
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`\nAll ${tests.length} kanji cache tests passed.`);
}
