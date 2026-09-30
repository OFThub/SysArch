export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'sysarch.theme';

// Storage can throw (private mode, blocked site data); the theme then follows the system.
export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Tokens use light-dark(); "system" just removes the override. */
export function applyThemePref(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Preference just won't persist.
  }
}
