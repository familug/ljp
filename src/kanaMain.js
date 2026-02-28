import { initTheme } from './shell/appShell.js';
import { BUILD_META } from './buildMeta.js';

function applyBuildMeta(win, doc) {
  const el = doc.getElementById('build-meta');
  if (!el || ! BUILD_META) return;
  const hash = BUILD_META.hash || 'dev';
  const datetime = BUILD_META.datetimeIso || '';
  const label = datetime ? `${hash} · ${datetime}` : hash;
  el.textContent = `Build ${label}`;
}

function initKanaChrome(win, doc) {
  const themeToggle = doc.getElementById('theme-toggle');
  const navToggle = doc.getElementById('nav-toggle');
  const navDrawer = doc.getElementById('nav-drawer');
  const navClose = doc.getElementById('nav-close');

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
}

applyBuildMeta(window, document);
initKanaChrome(window, document);

