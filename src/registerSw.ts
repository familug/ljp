/**
 * Register the service worker so the app works offline and loads fast (PWA).
 * Call from each entry point (main, kana, draw).
 */
export function registerSw(win: Window | null): void {
  if (!win?.navigator?.serviceWorker) return;
  try {
    const pathname = win.location.pathname;
    let appRoot = pathname.endsWith('/') ? pathname : pathname.replace(/\/[^/]*$/, '/');
    if (/\/kana\/|\/draw\/|\/settings\/|\/test\//.test(pathname)) {
      appRoot = appRoot.replace(/[^/]+\/$/, '/');
    }
    const swUrl = appRoot + 'sw.js';
    win.navigator.serviceWorker.register(swUrl, { scope: appRoot }).catch(() => {});
  } catch {
    // ignore
  }
}
