## Kanji N5–N2 Trainer

A small, static web app to practice **JLPT N5–N2 kanji**.  
Runs entirely in the browser and is suitable for **GitHub Pages** deployment.

### Features

- **JLPT N5–N2 coverage** using an external, open kanji dataset
- **Per-kanji details**: readings, meanings, and an auto-generated example sentence
- **Device text-to-speech (TTS)** using the browser's Speech Synthesis API
- **Progress persistence**: known/unknown stats and per-kanji results saved in `localStorage`
- **Functional core, imperative shell** architecture
- **Red/green tests** for the functional core with a tiny custom test runner
- **Dark mode** with `prefers-color-scheme` support and manual toggle
- **Pure HTML/CSS/JS** (no build step required)

### Project structure

- `index.html` – main entry page for the app
- `styles.css` – global styles and dark mode
- `src/core/kanjiData.js` – kanji dataset (N3/N2, sample subset)
- `src/core/quizCore.js` – functional core (state, filtering, quiz flow)
- `src/shell/appShell.js` – imperative shell (DOM, events, TTS, theming)
- `src/main.js` – wiring core + shell for the browser
- `tests/core.test.js` – basic red/green tests for the core

### Running locally (with Bun, no npm)

1. Install **Bun** (see `https://bun.sh`), which bundles a Node-compatible runtime.
2. From this directory, run the tests for the functional core:

   ```bash
   bun tests/core.test.js
   ```

3. To open the app, serve the folder using any static file server you like, for example:

   ```bash
   python3 -m http.server 8000
   # or, if you prefer Bun's simple server:
   bunx serve .
   ```

   Then open the printed URL (e.g. `http://localhost:8000`) in your browser.

   **Run on your phone (same Wi‑Fi):**  
   To use the app on your phone while the server runs on your computer, bind the server to all interfaces and open it from the phone using your computer’s local IP:

   ```bash
   python3 -m http.server 8000 --bind 0.0.0.0
   ```

   Find your computer’s LAN IP (e.g. `192.168.1.5` on Linux: `ip addr`; on macOS: System Settings → Network). On your phone’s browser, open `http://<that-IP>:8000/` (same Wi‑Fi required). The app will load; kanji data is cached after the first load so repeat visits are fast.  
   Note: over plain HTTP the PWA (install / offline) will not activate on the phone; for “Add to Home Screen” and offline use, open the app via **GitHub Pages** (HTTPS) on the phone.

   On first load, the app will fetch the **full kanji dataset** from  
   `https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json`  
   and filter it down to **JLPT N5–N2** entries (N5, N4, N3, N2).

### Deploying to GitHub Pages

1. Create a new GitHub repository.
2. Copy this project into the repo and commit it.
3. Push to GitHub.
4. In the repository settings, enable **GitHub Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` (or your default) / root directory
5. After Pages builds, visit the provided URL – the app should load directly.

### Notes on text-to-speech

- The app uses the browser's **Speech Synthesis API**.
- TTS support and available **Japanese voices (`ja-JP`)** depend on:
  - The browser
  - The operating system and installed voices
- If no Japanese voice is found, the browser's default voice will be used.

### Extending the kanji list

- The primary source is the external JLPT kanji dataset mentioned above.
- `src/core/kanjiData.js` still contains a small inline sample list that is only used as a **fallback** when the external dataset cannot be loaded.

