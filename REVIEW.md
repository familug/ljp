# Code Review: JLPT Kanji Trainer

## 1. Architecture & Code Quality

### Strengths

- Clear **functional core / imperative shell** separation. Pure logic in `src/core/`, DOM/side-effects in `src/shell/`.
- TypeScript strict mode enabled.
- Zero runtime dependencies -- appropriate for static GitHub Pages deployment.

### Issues

**A. Nav drawer logic duplicated across 4 entry points**

The same `openNav`/`closeNav`/`toggleNav` code is copy-pasted in:
- `src/shell/appShell.ts:261-280`
- `src/drawMain.ts:39-58`
- `src/kanaMain.ts:19-38`
- `src/settingsMain.ts:22-41`

Extract into a shared `initNavDrawer(doc)` function.

**B. `applyBuildMeta` duplicated in all 4 entry points**

Identical function in `main.ts`, `drawMain.ts`, `kanaMain.ts`, `settingsMain.ts`. Should be a shared export from `buildMeta.ts`.

**C. `appShell.ts` is a ~900-line monolith**

`bootstrapKanjiApp` spans ~700 lines covering TTS, SRS scheduling, daily goals, canvas drawing, and the render loop. Consider splitting into: TTS module, canvas/writing module, daily goal module.

**D. Committed `.js` alongside `.ts` sources**

The pre-commit hook (`hooks/pre-commit`) runs `npm run build && git add src/`, which auto-stages all compiled JS. If someone forgets to build, `.js` and `.ts` can drift. Add a CI check that verifies `tsc` produces no diff.

**E. Unrelated `gochu_agent.md` in repo**

This 253-line document is for a completely different project (Vietnamese Telex input engine). Should be removed.

**F. Dead code: `advance` import and `state.revealed`**

`advance` is imported in `appShell.ts:7` but never called (shell uses its own `pickNextIndex`). `QuizState.revealed` is set but never read in the shell (uses its own `detailsOpen` boolean).

---

## 2. Bugs & Correctness Issues

**A. Service worker registration broken for `/settings/` (BUG)**

`src/registerSw.ts:10` only matches `/kana/` and `/draw/`:
```typescript
if (/\/kana\/|\/draw\//.test(pathname)) {
```
The `/settings/` page is not listed, so the SW registers with the wrong scope.

**B. SRS ease factor grows without bound (BUG)**

`src/core/srs.ts:51` increments ease by 0.05 on every `good` rating with no cap. Standard SM-2 caps at ~2.5-3.0. After 20+ reviews, intervals grow exponentially.

**C. `fetchTatoebaExamples.mjs` writes to `.js` not `.ts` (BUG)**

`scripts/fetchTatoebaExamples.mjs:96` writes to `exampleOverrides.js` but the source is `exampleOverrides.ts`.

**D. Per-kanji progress uses unsafe `as number` casts**

`appShell.ts:577-578` casts localStorage values with `as number` without validation. Corrupted data produces silent `NaN` propagation through SRS calculations.

**E. `pickNextIndex` can crash on empty `windowCards`**

`appShell.ts:419` -- if filtering produces an empty array, `chosen.index` throws `TypeError`.

**F. History array grows without bound**

`quizCore.ts:103-104` spreads into a new array on every review. Never truncated. O(n) per review, unbounded memory.

**G. `localStorage` access can throw in private browsing**

Accessing `win.localStorage` itself (not just `.getItem()`) can throw `SecurityError` in some browsers.

---

## 3. UX/UI Suggestions

**A. No keyboard shortcuts**

No keyboard navigation for the primary study flow. Add: `1`/`2` or arrow keys for known/unknown, `Space` for next, `Enter` to reveal.

**B. Markdown shown literally in hint panel**

`index.html:229-233` shows `**text**` literally instead of bold. Use `<strong>` tags.

**C. "How to use" panel hidden on mobile**

`styles.css:500-504` sets `.panel { display: none }` on mobile. New users on mobile see no instructions.

**D. No visual feedback when reaching daily goal**

The "Today: X / Y" counter has no celebration or color change on goal completion.

**E. Example sentences lack readings**

All 1000+ Tatoeba overrides in `exampleOverrides.ts` have empty `reading` fields. For N3-N5 learners, this is a significant gap.

**F. No way to reset progress**

No UI to clear localStorage. Users must use devtools.

**G. Theme toggle icon flash on light mode**

HTML hardcodes the dark-mode moon emoji. Brief flash of wrong icon when user preference is light.

---

## 4. Performance

**A. Draw page recognition is O(n) and synchronous**

`drawMain.ts:189-194` iterates over 1000+ kanji, rendering and comparing each synchronously on the main thread. Move to a Web Worker or pre-compute glyph data.

**B. `pickNextIndex` iterates entire pool every transition**

`appShell.ts:399-421` normalizes SRS state for every kanji, filters, and sorts on every card change.

**C. `savePersistedProgress` writes all data on every review**

`appShell.ts:595` serializes the entire progress object on every click. Consider debouncing.

---

## 5. Feature Suggestions

- **SRS visibility**: Show due card count, next review time, new vs review cards.
- **Multiple study modes**: Meaning-to-kanji, reading-to-kanji, multiple choice.
- **N1 support**: The data source likely contains N1 entries.
- **Progress export/import**: JSON export for backup and cross-device transfer.
- **Stroke order**: Integrate with KanjiVG for animated stroke order diagrams.
- **Better examples**: Highlight the target kanji in example sentences.

---

## 6. Testing Gaps

| Module | Status |
|--------|--------|
| `quizCore.ts` | 10 tests |
| `kanjiCache.ts` | 5 tests |
| `strokeScore.ts` | 11 tests |
| `srs.ts` | **No tests** -- critical SRS algorithm untested |
| `jlptSource.ts` | **No tests** -- data loading/transformation |
| `registerSw.ts` | **No tests** -- path regex logic |
| `buildMeta.ts` | **No tests** -- date formatting |
| `appShell.ts` | **No tests** -- initTheme, pickNextIndex, daily goals, TTS |

Priority: Add SRS tests (ease floor, interval progression, grade handling).

---

## 7. Build & Tooling

**A. Pre-commit hook uses `npm` but project uses Bun**

`hooks/pre-commit:2` runs `npm run build`. Should be `bun run build` for consistency.

**B. `git add src/` in pre-commit is overly broad**

Stages ALL of `src/` after build, including unintended unstaged TS changes.

**C. No CI pipeline**

No GitHub Actions. Should run tests, verify `tsc` compiles, check JS/TS drift.

**D. No linter or formatter**

No ESLint, Prettier, or Biome configured.

**E. Service worker cache never updates**

`sw.js:6` hardcodes `CACHE_NAME = 'jlpt-trainer-v1'`. Old content is never evicted on update. Incorporate build hash into cache name.

**F. App icon is letter "f"**

`icon.svg` shows a Latin "f" in a box. Should use a kanji character like `漢` or `字`.

---

## Priority Summary

| Priority | Issue |
|----------|-------|
| High | SW registration broken for `/settings/` |
| High | SRS ease grows without bound |
| High | Zero test coverage for SRS module |
| High | `fetchTatoebaExamples.mjs` writes to wrong file |
| Medium | Unsafe `as number` casts on localStorage data |
| Medium | `appShell.ts` monolith needs decomposition |
| Medium | Duplicated nav drawer + build meta code |
| Medium | Example sentences lack readings |
| Medium | Draw recognition is synchronous O(n) |
| Medium | SW cache version never changes |
| Low | Dead code (`advance`, `state.revealed`) |
| Low | Unrelated `gochu_agent.md` in repo |
| Low | Markdown shown literally in hints |
| Low | No CI, linter, or formatter |
