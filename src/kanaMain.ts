import { initTheme, initPageShortcuts } from './shell/appShell.js';
import { BUILD_META, formatBuildLabel } from './buildMeta.js';
import { registerSw } from './registerSw.js';

function applyBuildMeta(win: Window, doc: Document): void {
  const el = doc.getElementById('build-meta');
  if (!el || !BUILD_META) return;
  el.textContent = formatBuildLabel(BUILD_META.hash, BUILD_META.datetimeIso);
}

function initKanaChrome(win: Window, doc: Document): void {
  const themeToggle = doc.getElementById('theme-toggle');
  const navToggle = doc.getElementById('nav-toggle');
  const navDrawer = doc.getElementById('nav-drawer');
  const navClose = doc.getElementById('nav-close');

  initTheme(win, doc, themeToggle);

  function openNav(): void {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.add('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'true');
  }

  function closeNav(): void {
    if (!navDrawer || !navToggle) return;
    navDrawer.classList.remove('nav-drawer--open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleNav(): void {
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

registerSw(window);
applyBuildMeta(window, document);
initKanaChrome(window, document);
initPageShortcuts(window, document, '../');
