/**
 * theme.js — basit tema yöneticisi (Vanilla JS, React'sız)
 *
 * legacy main.js'ten de çağrılabilir. localStorage'a yazar, <html>'e
 * data-theme attribute set eder. Default: dark.
 */
const STORAGE_KEY = 'seramikcim.theme';
const VALID = new Set(['light', 'dark']);

export function getTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (VALID.has(stored)) return stored;
  } catch {
    /* localStorage erişim engeli */
  }
  return 'dark';
}

export function setTheme(theme) {
  if (!VALID.has(theme)) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.dispatchEvent(new CustomEvent('seramikcim:theme', { detail: theme }));
  } catch {
    /* ignore */
  }
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** İlk açılışta çağır: HTML attribute'unu set eder. */
export function initTheme() {
  setTheme(getTheme());
}

/** Header'da tema butonu (vanilla JS, legacy main.js'ten çağrılır). */
export function mountThemeToggle(container) {
  if (!container) return;
  const btn = document.createElement('button');
  btn.className = 'icon-btn theme-toggle-btn';
  btn.setAttribute('aria-label', 'Tema değiştir (açık / koyu)');
  btn.title = 'Tema değiştir';
  const render = () => {
    btn.innerHTML = getTheme() === 'dark'
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  };
  render();
  btn.addEventListener('click', () => {
    toggleTheme();
    render();
  });
  container.appendChild(btn);
  return btn;
}
