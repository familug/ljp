import { initTheme, initPageShortcuts, initLangToggle, buildNavLinks } from './shell/appShell.js';
import { BUILD_META, formatBuildLabel } from './buildMeta.js';
import { registerSw } from './registerSw.js';
import { getStoredLanguage, LANGUAGES } from './core/language.js';
function applyBuildMeta(win, doc) {
    const el = doc.getElementById('build-meta');
    if (!el || !BUILD_META)
        return;
    el.textContent = formatBuildLabel(BUILD_META.hash, BUILD_META.datetimeIso);
}
function initKanaChrome(win, doc) {
    const langId = getStoredLanguage(win);
    const langConfig = LANGUAGES[langId];
    // Redirect to home if this page isn't applicable for the current language
    if (!langConfig.pages.includes('kana')) {
        win.location.href = '../';
        return;
    }
    initLangToggle(win, doc, langConfig);
    buildNavLinks(doc, langConfig, '../', 'kana');
    const themeToggle = doc.getElementById('theme-toggle');
    const navToggle = doc.getElementById('nav-toggle');
    const navDrawer = doc.getElementById('nav-drawer');
    const navClose = doc.getElementById('nav-close');
    initTheme(win, doc, themeToggle);
    function openNav() {
        if (!navDrawer || !navToggle)
            return;
        navDrawer.classList.add('nav-drawer--open');
        navToggle.setAttribute('aria-expanded', 'true');
    }
    function closeNav() {
        if (!navDrawer || !navToggle)
            return;
        navDrawer.classList.remove('nav-drawer--open');
        navToggle.setAttribute('aria-expanded', 'false');
    }
    function toggleNav() {
        if (!navDrawer || !navToggle)
            return;
        if (navDrawer.classList.contains('nav-drawer--open')) {
            closeNav();
        }
        else {
            openNav();
        }
    }
    if (navToggle && navDrawer) {
        navToggle.addEventListener('click', toggleNav);
    }
    if (navClose) {
        navClose.addEventListener('click', closeNav);
    }
    initPageShortcuts(win, doc, '../', langConfig);
}
registerSw(window);
applyBuildMeta(window, document);
initKanaChrome(window, document);
