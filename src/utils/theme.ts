export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tintalata_theme';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: ThemeMode, persist = true): ThemeMode {
  const normalized: ThemeMode = theme === 'dark' ? 'dark' : 'light';

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', normalized === 'dark');
    root.dataset.theme = normalized;
    root.style.colorScheme = normalized;

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', normalized === 'dark' ? '#0f172a' : '#1d4ed8');
    }
  }

  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage quota / privacy mode restrictions
    }
    window.dispatchEvent(new CustomEvent<ThemeMode>('tintalata:theme-change', { detail: normalized }));
  }

  return normalized;
}
