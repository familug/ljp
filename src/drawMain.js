import { initTheme } from './shell/appShell.js';
import { loadJlptKanji } from './data/jlptSource.js';
import { getCachedKanji, setCachedKanji } from './data/kanjiCache.js';
import { ALL_KANJI as SAMPLE_KANJI } from './core/kanjiData.js';
import { BUILD_META } from './buildMeta.js';
import { registerSw } from './registerSw.js';

function applyBuildMeta(win, doc) {
  const el = doc.getElementById('build-meta');
  if (!el || !BUILD_META) return;
  const hash = BUILD_META.hash || 'dev';
  const datetime = BUILD_META.datetimeIso || '';
  const label = datetime ? `${hash} · ${datetime}` : hash;
  el.textContent = `Build ${label}`;
}

function getContext(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }
  return ctx;
}

function setupDrawing(win, doc) {
  const canvas = doc.getElementById('draw-canvas');
  const clearBtn = doc.getElementById('draw-clear');
  const guessBtn = doc.getElementById('draw-guess');
  const results = doc.getElementById('draw-results');
  const themeToggle = doc.getElementById('theme-toggle');
  const navToggle = doc.getElementById('nav-toggle');
  const navDrawer = doc.getElementById('nav-drawer');
  const navClose = doc.getElementById('nav-close');

  if (!canvas || !results || !guessBtn || !clearBtn) {
    return;
  }

  initTheme(win, doc, themeToggle);

  function openNav() {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.add('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'true');
  }

  function closeNav() {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.remove('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleNav() {
    if (!navDrawer || !navToggle) return;
    if (navDrawer.classList.contains('nav-drawer--open')) {
      closeNav();
    } else {
      openNav();
    }
  }

  if (navToggle && navDrawer) {
    navToggle.addEventListener('click', toggleNav);
  }

  if (navClose) {
    navClose.addEventListener('click', closeNav);
  }

  const size = 256;
  canvas.width = size;
  canvas.height = size;

  const ctx = getContext(canvas);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#f9fafb';

  function clearCanvas() {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, size, size);
  }

  clearCanvas();

  let drawing = false;
  let hasInk = false;

  function getPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: x * scaleX,
      y: y * scaleY
    };
  }

  canvas.addEventListener('pointerdown', (evt) => {
    drawing = true;
    hasInk = true;
    canvas.setPointerCapture(evt.pointerId);
    const { x, y } = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });

  canvas.addEventListener('pointermove', (evt) => {
    if (!drawing) return;
    const { x, y } = getPos(evt);
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  function stopDrawing(evt) {
    if (!drawing) return;
    drawing = false;
    if (evt && canvas.hasPointerCapture(evt.pointerId)) {
      canvas.releasePointerCapture(evt.pointerId);
    }
  }

  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('pointerleave', stopDrawing);

  clearBtn.addEventListener('click', () => {
    clearCanvas();
    hasInk = false;
    results.innerHTML = '';
  });

  let kanjiList = [];
  let ready = false;

  function formatKanjiEntry(entry) {
    const level = entry.level || '';
    const meanings = (entry.meanings || []).join(', ');
    return `${entry.kanji} (${level}) – ${meanings}`;
  }

  function recognize() {
    if (!ready) return;
    if (!hasInk) {
      results.textContent = 'Draw a kanji in the box first.';
      return;
    }

    const tmpCanvas = doc.createElement('canvas');
    const glyphCanvas = doc.createElement('canvas');
    const targetSize = 32;
    tmpCanvas.width = targetSize;
    tmpCanvas.height = targetSize;
    glyphCanvas.width = targetSize;
    glyphCanvas.height = targetSize;
    const tmpCtx = getContext(tmpCanvas);
    const glyphCtx = getContext(glyphCanvas);

    tmpCtx.drawImage(canvas, 0, 0, targetSize, targetSize);
    const userData = tmpCtx.getImageData(0, 0, targetSize, targetSize).data;

    function scoreFor(entry) {
      glyphCtx.fillStyle = '#020617';
      glyphCtx.fillRect(0, 0, targetSize, targetSize);
      glyphCtx.fillStyle = '#f9fafb';
      glyphCtx.textAlign = 'center';
      glyphCtx.textBaseline = 'middle';
      glyphCtx.font = '26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      glyphCtx.fillText(entry.kanji, targetSize / 2, targetSize / 2);

      const data = glyphCtx.getImageData(0, 0, targetSize, targetSize).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const ur = userData[i];
        const ug = userData[i + 1];
        const ub = userData[i + 2];
        const gr = data[i];
        const gg = data[i + 1];
        const gb = data[i + 2];
        const u = (ur + ug + ub) / (3 * 255);
        const g = (gr + gg + gb) / (3 * 255);
        const diff = u - g;
        sum += diff * diff;
      }
      return sum;
    }

    const scored = kanjiList.map((k) => ({
      entry: k,
      score: scoreFor(k)
    }));

    scored.sort((a, b) => a.score - b.score);
    const top = scored.slice(0, 10);

    const list = doc.createElement('ol');
    list.className = 'draw-results__list';
    top.forEach((item) => {
      const li = doc.createElement('li');
      li.textContent = formatKanjiEntry(item.entry);
      list.appendChild(li);
    });

    results.innerHTML = '';
    results.appendChild(list);
  }

  guessBtn.addEventListener('click', recognize);

  // Load kanji data (use cache so repeat loads are instant)
  const cached = getCachedKanji(win.localStorage || null);
  if (cached && cached.length > 0) {
    kanjiList = cached;
    ready = true;
    guessBtn.disabled = false;
    results.textContent = 'Draw a kanji, then tap "Guess kanji".';
    loadJlptKanji(['N5', 'N4', 'N3', 'N2'])
      .then((fresh) => {
        setCachedKanji(win.localStorage, fresh);
      })
      .catch(() => {});
    return;
  }

  guessBtn.disabled = true;
  results.textContent = 'Loading kanji list…';

  loadJlptKanji(['N5', 'N4', 'N3', 'N2'])
    .then((all) => {
      const list = Array.isArray(all) ? all : SAMPLE_KANJI;
      setCachedKanji(win.localStorage, list);
      kanjiList = list;
      ready = true;
      guessBtn.disabled = false;
      results.textContent = 'Draw a kanji, then tap "Guess kanji".';
    })
    .catch(() => {
      kanjiList = SAMPLE_KANJI;
      ready = true;
      guessBtn.disabled = false;
      results.textContent =
        'Using built-in sample kanji. Draw a kanji, then tap "Guess kanji".';
    });
}

registerSw(window);
applyBuildMeta(window, document);
setupDrawing(window, document);

