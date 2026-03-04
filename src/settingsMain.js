import { initTheme, initPageShortcuts, readDailyGoal, writeDailyGoal, initLangToggle, buildNavLinks } from './shell/appShell.js';
import { BUILD_META, formatBuildLabel } from './buildMeta.js';
import { registerSw } from './registerSw.js';
import { getStoredLanguage, LANGUAGES } from './core/language.js';
function applyBuildMeta(win, doc) {
    const el = doc.getElementById('build-meta');
    if (!el || !BUILD_META)
        return;
    el.textContent = formatBuildLabel(BUILD_META.hash, BUILD_META.datetimeIso);
}
function initSettingsPage(win, doc) {
    const langId = getStoredLanguage(win);
    const langConfig = LANGUAGES[langId];
    initLangToggle(win, doc, langConfig);
    buildNavLinks(doc, langConfig, '../', 'settings');
    const themeToggle = doc.getElementById('theme-toggle');
    const navToggle = doc.getElementById('nav-toggle');
    const navDrawer = doc.getElementById('nav-drawer');
    const navClose = doc.getElementById('nav-close');
    const dailyGoalInput = doc.getElementById('daily-goal');
    const savedMessage = doc.getElementById('daily-goal-saved');
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
    if (dailyGoalInput) {
        dailyGoalInput.value = String(readDailyGoal(win, langConfig));
        dailyGoalInput.addEventListener('change', () => {
            const raw = parseInt(dailyGoalInput.value, 10);
            const n = Number.isFinite(raw) ? Math.max(1, Math.min(1000, Math.floor(raw))) : 40;
            dailyGoalInput.value = String(n);
            writeDailyGoal(win, n, langConfig);
            if (savedMessage) {
                savedMessage.style.display = '';
                savedMessage.textContent = 'Saved.';
                win.setTimeout(() => {
                    savedMessage.style.display = 'none';
                }, 2000);
            }
        });
        dailyGoalInput.addEventListener('blur', () => {
            const raw = parseInt(dailyGoalInput.value, 10);
            const n = Number.isFinite(raw) ? Math.max(1, Math.min(1000, Math.floor(raw))) : 40;
            if (Number(dailyGoalInput.value) !== n) {
                dailyGoalInput.value = String(n);
                writeDailyGoal(win, n, langConfig);
            }
        });
    }
    initPageShortcuts(win, doc, '../', langConfig);
}
registerSw(window);
applyBuildMeta(window, document);
initSettingsPage(window, document);
