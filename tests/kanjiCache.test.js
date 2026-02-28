import assert from 'node:assert/strict';
import { getCachedKanji, setCachedKanji } from '../src/data/kanjiCache.js';

function testGetCachedKanjiMissing() {
  const storage = { getItem: () => null };
  assert.equal(getCachedKanji(storage), null);
}

function testGetCachedKanjiInvalid() {
  const storage = { getItem: () => 'not json' };
  assert.equal(getCachedKanji(storage), null);

  const empty = { getItem: () => '[]' };
  assert.equal(getCachedKanji(empty), null, 'empty array is invalid');
}

function testSetAndGetCachedKanji() {
  const store = {};
  const storage = {
    getItem(key) {
      return store[key] ?? null;
    },
    setItem(key, value) {
      store[key] = value;
    }
  };
  const list = [{ id: 'N3-学', kanji: '学' }];
  setCachedKanji(storage, list);
  const got = getCachedKanji(storage);
  assert.ok(Array.isArray(got));
  assert.equal(got.length, 1);
  assert.equal(got[0].kanji, '学');
}

function testSetCachedKanjiIgnoresNonArray() {
  const store = {};
  const storage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; }
  };
  setCachedKanji(storage, null);
  setCachedKanji(storage, {});
  assert.equal(storage.getItem('jlpt-kanji-cache-v1'), null);
}

function testGetCachedKanjiNullStorage() {
  assert.equal(getCachedKanji(null), null);
}

const tests = [
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
