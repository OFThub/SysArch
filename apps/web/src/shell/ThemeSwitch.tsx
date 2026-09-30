import { useState } from 'react';
import { tr } from '../i18n/tr';
import { applyThemePref, readThemePref, type ThemePref } from '../theme';

const THEMES: ThemePref[] = ['system', 'light', 'dark'];

export function ThemeSwitch() {
  const [theme, setTheme] = useState(readThemePref);

  const choose = (pref: ThemePref) => {
    applyThemePref(pref);
    setTheme(pref);
  };

  return (
    <div role="radiogroup" aria-label={tr.theme.label} className="flex border border-line">
      {THEMES.map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          onClick={() => choose(t)}
          className="px-2.5 py-1 text-sm text-ink-muted aria-checked:bg-raised aria-checked:text-ink"
        >
          {tr.theme[t]}
        </button>
      ))}
    </div>
  );
}
