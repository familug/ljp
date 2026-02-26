JLPTKanjiTrainerAgent – Agent Notes
===================================

Agent identity
--------------
- **Canonical agent name**: `JLPTKanjiTrainerAgent`
- **Scope**: Static web app for JLPT N5–N2 kanji study.

Purpose
-------
- Static JLPT kanji trainer (N5–N2 focus).
- Designed to run on GitHub Pages or any static HTTP server.
- Emphasizes **functional core, imperative shell**, minimal tooling, pure ES modules.

High-level architecture
-----------------------
- `index.html`
  - Single-page app shell.
  - Loads `styles.css` and `src/main.js` (ES module).
  - Provides semantic structure: header (filters + theme toggle), main card UI, hint panel, footer.
- `styles.css`
  - Global styling + modern card UI.
  - Dark/light themes via `html[data-theme]` using CSS custom properties.
  - Respects `color-scheme` and overall `prefers-reduced-motion`.
- `src/main.js`
  - Startup wiring: asynchronously loads the full JLPT kanji list and then calls `bootstrapKanjiApp(...)`.
  - On failure (e.g. offline or network issues), falls back to the small sample set from `kanjiData.js`.
- `src/core/kanjiData.js`
  - Static sample data only. Exports `KANJI_N3`, `KANJI_N2`, `ALL_KANJI = [...KANJI_N3, ...KANJI_N2]`.
  - Each kanji object has:
    - `id`: stable string (e.g. `N3-学`).
    - `level`: `'N3'` or `'N2'`.
    - `kanji`: single character.
    - `onyomi`: string[].
    - `kunyomi`: string[].
    - `meanings`: string[] (English glosses).
    - `example`: `{ sentence, reading, translation }`.
  - No side effects, safe to import in tests and browser.
- `src/data/jlptSource.js`
  - Fetches the public kanji dataset from:
    - `https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json`
  - Filters entries by `jlpt_new` and maps them into JLPT levels:
    - `jlpt_new = 5` → `N5`
    - `jlpt_new = 4` → `N4`
    - `jlpt_new = 3` → `N3`
    - `jlpt_new = 2` → `N2`
  - Auto-generates a simple example sentence for each kanji:
    - Sentence: `KANJIの意味を勉強します。`
    - Reading: primary reading (kun or on) + `の いみ を べんきょう します。`
    - Translation: `"I study the meaning of KANJI."`
- `src/core/quizCore.js` (functional core)
  - Pure logic; **no DOM, no browser APIs**.
  - Key exports:
    - `filterByLevels(allKanji, levels)` → filtered array.
    - `createSession(allKanji, { levels })` → initial immutable state.
    - `setLevels(state, allKanji, levels)` → new state with new pool.
    - `toggleReveal(state)` / `reveal(state)` / `hide(state)` → manage `revealed` flag.
    - `markKnown(state)` / `markUnknown(state)` → update stats, history, and schedule next card.
    - `advance(state)` → next card without affecting stats.
    - `getAccuracy(state)` → `0–100` number.
  - State shape:
    - `pool`: current kanji list (filtered by levels).
    - `currentIndex`: index into `pool` or `-1` if empty (randomized on session start).
    - `revealed`: boolean (controls readings visibility).
    - `stats`: `{ seen, known, unknown }`.
    - `history`: array of `{ id, level, result }` for each answered card.
    - `filter.levels`: array of levels (e.g. `['N3']`, `['N2']`, `['N3','N2']`).
  - Internal helper:
    - `nextIndex(pool, currentIndex)` → picks a random next index, avoiding current index where possible.
- `src/shell/appShell.js` (imperative shell)
  - Owns all **DOM, events, and browser APIs (TTS, localStorage, matchMedia)**.
  - Exports `bootstrapKanjiApp(allKanji, window, document)`.
  - Responsibilities:
    - Theme:
      - `initTheme(win, doc, toggleButton)`:
        - Reads `localStorage['kanji-trainer-theme']` if present (`'light' | 'dark'`).
        - Otherwise uses `prefers-color-scheme: dark`.
        - Sets `documentElement.dataset.theme` and syncs toggle icon + ARIA label.
        - On toggle, updates dataset + localStorage, no page reload.
    - TTS:
      - `createTtsApi(win)`:
        - Guards `speechSynthesis` availability.
        - Chooses Japanese voice (`lang` starts with `ja`) if present, else fallback voice.
        - `speakKanji(kanji)`: speaks `kunyomi[0] || onyomi[0] || kanji`.
        - `speakExample(kanji)`: speaks example `sentence || reading`.
        - Uses `SpeechSynthesisUtterance`; cancels any ongoing utterance before speaking.
    - Levels:
      - `levelsFromSelectValue(value)`:
        - `'N5'` → `['N5']`
        - `'N4'` → `['N4']`
        - `'N3'` → `['N3']`
        - `'N2'` → `['N2']`
        - `'N5-N3'` → `['N5', 'N4', 'N3']`
        - `'ALL'` → `['N5', 'N4', 'N3', 'N2']`
    - State + rendering:
      - On bootstrap:
        - `const initialLevels = levelsFromSelectValue(levelSelect?.value ?? 'N3');`
        - `let state = createSession(allKanji, { levels: initialLevels });`
      - `render(state)`:
        - Updates DOM based on `pool`, `currentIndex`, `revealed`, `stats`.
        - Handles disabled/enabled states for buttons when there is no kanji.
        - Applies blur/visibility to readings (`card__section-content--hidden/--visible`).
        - Displays progress: `Seen: N`, `Known: K (ACC%)`, where `ACC = getAccuracy(state)`.
      - Progress persistence:
        - Uses `localStorage['jlpt-kanji-progress-v1']` to store:
          - Aggregate stats `state.stats` (`seen`, `known`, `unknown`).
          - A per-kanji map `{ [id]: { seen, known, unknown, lastResult } }`.
        - On load, restores `state.stats` and the per-kanji map (currently only used for persistence, not selection).
        - On each "known" / "unknown" action:
          - Updates stats via `markKnown` / `markUnknown`.
          - Records the result for the answered kanji ID.
          - Writes a snapshot back to `localStorage`.
    - Event wiring:
      - Level select `change` → `setLevels` + `render`.
      - Reveal/hide button → `toggleReveal` + `render`.
      - Known/unknown buttons → `markKnown`/`markUnknown` + `render`.
      - Next button → `advance` + `render`.
      - TTS buttons → call `tts.speakKanji` / `tts.speakExample` on current card.

Testing and red/green flow
--------------------------
- Test runner is intentionally minimal and focused on the **functional core**, not the DOM.
- File: `tests/core.test.js`.
- Uses Node’s built-in `assert/strict` and ES modules.
- Tests cover:
  - `filterByLevels` (N3 vs N2 vs both).
  - `createSession` defaults (N3, stats, revealed flag, index).
  - Reveal toggle logic.
  - `markKnown` / `markUnknown` plus history and `getAccuracy`.
  - `setLevels` to ensure pool switches to N2 correctly.
  - `advance` leaving stats unchanged while moving index.
- Command:
  - Preferred: `bun tests/core.test.js` (or `bun run test`).
  - Fallback: `node tests/core.test.js` if Bun is unavailable.
- When changing core behavior (e.g. stats, levels, randomization rules), **update tests first, then core** to preserve red/green discipline.

Running locally
---------------
- Tests:
  - With Bun (preferred): `bun tests/core.test.js`.
  - With Node: `node tests/core.test.js`.
- Static HTTP server for UI:
  - From project root (`/home/arch/ljp`), any of:
    - `python3 -m http.server 8000`
    - `bunx serve .` (once Bun is installed)
  - Open `http://localhost:8000/` (or printed URL) in a modern browser that supports ES modules and the Speech Synthesis API.
- Common pitfall:
  - `404` in Python server logs after `/` is usually just `favicon.ico` and is harmless.
  - Real issues will show in browser dev tools console (JS errors).

GitHub Pages / Deployment notes
-------------------------------
- Project is **fully static**; no build step is required.
- Files expected at repository root:
  - `index.html`, `styles.css`, `src/**`, `tests/**`, `package.json`, `README.md`, `AGENTS.md`.
- GitHub Pages:
  - Settings → Pages → Source: "Deploy from a branch".
  - Choose main branch and root directory.
  - App loads at `https://<user>.github.io/<repo>/`.
- ES modules:
  - All imports use relative paths (`./core/kanjiData.js`, `../core/quizCore.js`).
  - Keep that structure if you move files; Pages must serve them at the expected URLs.

Extending the kanji data
------------------------
- To add more kanji (recommended for full N3/N2 coverage):
  - Append new objects to `KANJI_N3` or `KANJI_N2` in `src/core/kanjiData.js`.
  - Ensure a **unique `id`** per entry (e.g. `N3-新-1` if duplicates arise).
  - Populate `example.sentence` + `example.reading` + `example.translation` whenever possible.
  - Keep `level` strictly `'N3'` or `'N2'` or adjust filter logic / UI if you introduce new levels.
- No additional work is needed in the core or shell, as long as object shape is preserved.

Modifying quiz behavior
-----------------------
- For any **logic change**, work in `quizCore.js` and tests:
  - Example: introduce spaced repetition, weighting unknown cards more heavily:
    - Add fields to `state` (e.g. per-kanji scores/weights).
    - Adjust `recordResult` / `nextIndex` to use those weights.
    - Update tests in `core.test.js` to describe the new behavior explicitly.
- When the core state shape changes:
  - Keep `bootstrapKanjiApp` as a thin adapter; only update it to match new shape (e.g. new stats fields).
  - Avoid pulling DOM or `window` into the core.

Working with the shell / UI
---------------------------
- When adding new UI features:
  - Extend `index.html` for structure, `styles.css` for presentation, and `appShell.js` for behavior.
  - Keep **business logic** in `quizCore.js` so it can stay well-tested.
- For example, to add:
  - **Per-level accuracy**:
    - Track additional stats in state history or stats sub-objects.
    - Add rendering to display them in `render(...)` and new tests validating those stats.
  - **Session reset**:
    - Add a new pure function, e.g. `resetSession(state, allKanji)` in core.
    - Wire a UI button in shell calling that function and re-rendering.

Text-to-speech (TTS) specifics
------------------------------
- Uses the **Web Speech API** (`window.speechSynthesis`, `SpeechSynthesisUtterance`).
- Availability and quality depend on:
  - Browser (Chrome/Firefox/Edge/Safari).
  - OS-level installed voices, especially Japanese (`ja-JP`).
- Behavior:
  - If TTS is missing, TTS buttons are disabled with an informative tooltip.
  - On each speak action:
    - Existing speech is canceled before starting a new utterance.
    - Language is set to Japanese (`ja-JP`) if a Japanese voice is found, otherwise uses voice’s own `lang`.
- If you need to debug TTS issues:
  - Check `speechSynthesis.getVoices()` in browser console to verify voices.
  - Consider adding a small diagnostics panel (but keep it in the shell).

Dark mode & theming
-------------------
- Theme state:
  - Stored under `localStorage['kanji-trainer-theme']` as `'light'` or `'dark'`.
  - Falls back to `matchMedia('(prefers-color-scheme: dark)')`.
- CSS:
  - `:root` defines base tokens (colors, radii, shadows).
  - `html[data-theme='light']` overrides for light theme.
  - `color-scheme: dark light;` hints to the browser (scrollbars, form controls).
- To extend themes (e.g. high-contrast mode), prefer:
  - Another `data-theme` variant (e.g. `'high-contrast'`) with its own overrides.
  - A new toggle or auto-detection logic in `initTheme`.

Conventions and best practices
------------------------------
- Keep **core** free of:
  - `window`, `document`, `localStorage`, `speechSynthesis`, or other side effects.
- Use **pure functions** and explicit arguments/return values for core modules.
- Keep **shell**:
  - As a thin adapter between DOM events and core functions.
  - Responsible for side effects, I/O, and UX decisions.
- When editing:
  - Update tests when changing core.
  - Avoid very long functions in shell; factor out helpers if rendering becomes complex.
- Avoid adding heavy dependencies unless absolutely necessary (frameworks, state managers, etc.); the app is intentionally lightweight for GitHub Pages.

Quick checklist for future changes
----------------------------------
- New kanji or levels?
  - Update `kanjiData.js`, ensure `level` values are consistent, update any level-selection UI if needed.
- New quiz logic?
  - Implement in `quizCore.js`, adapt tests, then update shell rendering.
- New UI feature?
  - Adjust `index.html` + `styles.css` minimally; wire events in `appShell.js`.
- Deployment broken on GitHub Pages?
  - Check: file paths, case sensitivity, ES module imports, and JS errors in browser console.

Maintenance rule for AI agents
------------------------------
- **Always keep this `AGENTS.md` file up to date.**
- Whenever an AI agent (or human) makes a **non-trivial change** to:
  - Architecture (files, modules, data flow),
  - Core behavior (`quizCore.js`, data model, state shape, quiz logic),
  - External interfaces (how tests are run, how the app is served, deployment expectations),
  - or Agent identity (name, purpose, scope),
  they **must**:
  1. Review this file.
  2. Update or extend the relevant sections so the description matches current reality.
  3. Prefer concise bullet points over long prose.
- Treat this file as the single source of truth for future AI agents about how `JLPTKanjiTrainerAgent` is structured and meant to be used.

