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
  - Single-page **kanji trainer** shell at `/`.
  - Loads `styles.css` and `src/main.js` (ES module).
  - Provides semantic structure: header (emoji logo + level filter + theme toggle + hamburger), main card UI, hint panel, footer with build metadata.
- `kana/index.html`
  - Standalone **Kana basics** page at `/kana/` (hiragana/katakana charts and beginner explanations).
  - Shares `styles.css`, header/footer chrome, and nav drawer with `index.html`.
- `draw/index.html`
  - Standalone **Draw kanji** page at `/draw/` for handwriting-based lookup across N5–N2 kanji.
  - Shares `styles.css`, header/footer chrome, and nav drawer with `index.html`.
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
- `src/data/exampleOverrides.js`
  - Contains hand-crafted example sentences, readings, and translations for selected kanji.
  - `jlptSource.buildExample` checks this map first; if an entry exists, it is used instead of the generic template.
- `src/buildMeta.js`
  - Exports a small `BUILD_META` object `{ hash, datetimeIso }` baked at commit time.
  - `src/main.js`, `src/kanaMain.js`, and `src/drawMain.js` read this and write a footer line like `Build <hash> · <ISO_DATETIME>` for quick version identification.
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
    - Navigation:
      - Emoji logo (`🧑‍🎓 🇯🇵`) is a link back to `/`.
      - Hamburger button toggles a nav drawer listing:
        - **Kanji trainer** → `/`
        - **Kana basics** → `/kana/`
        - **Draw kanji** → `/draw/`
      - Drawer works on desktop and mobile; aria attributes (`aria-expanded`, `aria-current`) kept in sync.
    - Theme:
      - `initTheme(win, doc, toggleButton)`:
        - Reads `localStorage['kanji-trainer-theme']` if present (`'light' | 'dark'`).
        - Otherwise uses `prefers-color-scheme: dark`.
        - Sets `documentElement.dataset.theme` and syncs toggle icon + ARIA label.
        - On toggle, updates dataset + localStorage, no page reload.
    - TTS:
      - `createTtsApi(win)`:
        - Guards `speechSynthesis` availability.
        - Chooses a Japanese voice (`lang` starts with `ja`) for kanji + Japanese examples, or a fallback voice if none exists.
        - Chooses an English voice (`lang` starts with `en`) for English translations, or a fallback voice if none exists.
        - `speakKanji(kanji)`: speaks `kunyomi[0] || onyomi[0] || kanji` in Japanese.
        - `speakExample(kanji)`: speaks example `sentence || reading` in Japanese.
        - `speakExampleTranslation(kanji)`: speaks example `translation` in English so users can practice listening to English as well.
        - Uses `SpeechSynthesisUtterance`; cancels any ongoing utterance before speaking.
    - Levels:
      - `levelsFromSelectValue(value)`:
        - `'N5'` → `['N5']`
        - `'N4'` → `['N4']`
        - `'N3'` → `['N3']`
        - `'N2'` → `['N2']`
        - `'N5-N3'` → `['N5', 'N4', 'N3']`
        - `'ALL'` → `['N5', 'N4', 'N3', 'N2']`
    - Kanji trainer view (main card):
      - On bootstrap:
        - `const initialLevels = levelsFromSelectValue(levelSelect?.value ?? 'N3');`
        - `let state = createSession(allKanji, { levels: initialLevels });`
        - `render(state)`:
          - Updates DOM based on `pool`, `currentIndex`, `revealed`, `stats`.
          - Handles disabled/enabled states for buttons when there is no kanji.
          - Displays progress: `Seen: N`, `Known: K (ACC%)`, where `ACC = getAccuracy(state)`.
      - Sections:
        - **Kanji header**: shows current `level` + index `i / N`, big kanji glyph, and a TTS button for the kanji.
        - **Details accordion**:
          - Contains **Readings** (`音` + `訓`) and **Meanings**.
          - Initially collapsed; toggled by a `Show`/`Hide` button (pure UI flag, not tied to `state.revealed` anymore).
        - **Example**:
          - Example sentence, reading, and English translation.
          - Two TTS buttons:
            - Japanese example (`🔊`) and English translation (`EN`).
        - **Write it (per-kanji handwriting practice)**:
          - Controls:
            - `Write`: enters/exits write mode for the current kanji.
            - `Peek`: while in write mode, temporarily shows/hides the big kanji glyph.
            - A live `Stroke score: NN/100` indicator updated after each check.
          - When **write mode** is active:
            - The write canvas panel is shown directly under the kanji header, and **Details** + **Example** sections are hidden so users do not have to scroll on mobile.
            - The main kanji glyph is hidden unless `Peek` is active.
            - When the user starts drawing, the app temporarily hides the Details accordion (until they explicitly show it again).
            - On `Done`, `Next`, `I know this`, or `Don't know yet`, write mode is exited, the canvas is cleared, `Peek` is reset, and Details/Example are restored.
          - Canvas + scoring:
            - A square canvas (pointer-based) where the user draws a kanji.
            - `Check stroke`:
              - Downscales both user drawing and a font-rendered version of the current kanji to a small grid.
              - Computes a rough pixel-wise difference (sum of squared brightness differences normalized by stroke “energy”).
              - Maps that into a **0–100 stroke score** (higher is better) and shows qualitative feedback:
                - Very close (excellent), close enough (good practice), or quite different (encourages centering and using more of the box).
              - This is deliberately a **lightweight heuristic, not full OCR**; small misalignments are tolerated via relaxed thresholds.
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
      - Details `Show`/`Hide` button → toggles the Details accordion (UI-only flag) + `render`.
      - Known/unknown buttons → `markKnown`/`markUnknown` + persist per-kanji progress + `render`.
      - Next button → `advance` + `render` (write mode and peek are reset).
      - TTS buttons:
        - Call `tts.speakKanji` / `tts.speakExample` / `tts.speakExampleTranslation` on the current card.
      - Write mode buttons:
        - `Write` → toggle write mode; hide/show Details and Example; reset/clear canvas when leaving.
        - `Peek` → toggle big kanji visibility while staying in write mode.
        - `Clear` → clear only the handwriting canvas and stroke score.
        - `Check stroke` → run the pixel-based similarity check and update score + feedback.
- `src/kanaMain.js`
  - Entry point for the `/kana/` page.
  - Calls `initTheme(...)`, wires the shared nav drawer, applies `BUILD_META` to the footer, and leaves the kana content itself static (no per-item interactivity yet).
- `src/drawMain.js`
  - Entry point for the `/draw/` page.
  - Responsibilities:
    - Initializes a drawing canvas where the user can sketch *any* kanji.
    - Loads the JLPT N5–N2 list via `loadJlptKanji(...)` (or falls back to `KANJI_N3/N2` sample data).
    - For each kanji in the pool:
      - Renders a font glyph onto a tiny offscreen canvas and compares it to the user drawing using the same pixel-difference heuristic as write mode.
      - Sorts all kanji by this score and shows the **top 10 guesses** in an ordered list, formatted as `KANJI (LEVEL) – meanings`.
    - This page is explicitly **experimental**; it is meant as a rough handwriting helper rather than a production-grade OCR engine.

Testing and red/green flow
--------------------------
- Test runner is intentionally minimal and focused on the **functional core**, not the DOM.
- File: `tests/core.test.js`.
- Uses Node’s built-in `assert/strict` and ES modules.
- For any new feature or non-trivial behavior change, **add at least three focused tests** that describe the new behavior (happy path, edge cases, and failure/negative case where applicable).
- For every behavior change, feature, or bugfix, **add or update at least one unit test** that captures the expected behavior; do not remove tests that describe real user-visible behavior unless you also update this document to explain why the behavior changed.
- Tests cover:
  - `filterByLevels` (N3 vs N2 vs both).
  - `createSession` defaults (N3, stats, revealed flag, index).
  - Reveal toggle logic.
  - `markKnown` / `markUnknown` plus history and `getAccuracy`.
  - `setLevels` to ensure pool switches to N2 correctly.
  - `advance` leaving stats unchanged while moving index.
- Command:
  - Preferred: **Bun**: `bun tests/core.test.js` (or `bun run test`); always prefer Bun over Node when available.
  - Fallback: **Node**: `node tests/core.test.js` only if Bun is unavailable.
- When changing core behavior (e.g. stats, levels, randomization rules), **follow a strict red/green/refactor loop**:
  - Write or update tests first so they fail (red).
  - Implement the minimal code change to make them pass (green).
  - Refactor while keeping all tests green.
 - Whatever you produce must be **verified before you say it works**: for core logic, this means running the test suite; for UI-only changes, at minimum load the app in a browser (dark/light theme and small screens) and confirm the behavior manually.

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
 - When a change affects how users build, serve, or safely use the project (especially around data sources, persistence, or privacy), also update `README.md` with clear, factual notes so humans and future agents do not have to re-discover that knowledge.

