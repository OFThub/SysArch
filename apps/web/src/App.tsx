import { useState } from 'react';
import { tr } from './i18n/tr';
import { applyThemePref, readThemePref, type ThemePref } from './theme';

const THEMES: ThemePref[] = ['system', 'light', 'dark'];

export function App() {
  const [theme, setTheme] = useState(readThemePref);

  const chooseTheme = (pref: ThemePref) => {
    applyThemePref(pref);
    setTheme(pref);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 items-center gap-4 border-b border-line bg-panel px-4">
        <h1 className="font-wide text-md font-semibold">{tr.app.untitled}</h1>
        <div
          role="radiogroup"
          aria-label={tr.theme.label}
          className="ml-auto flex border border-line"
        >
          {THEMES.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => chooseTheme(t)}
              className="px-2.5 py-1 text-sm text-ink-muted aria-checked:bg-raised aria-checked:text-ink"
            >
              {tr.theme[t]}
            </button>
          ))}
        </div>
      </header>
      <main className="flex-1" />
    </div>
  );
}
