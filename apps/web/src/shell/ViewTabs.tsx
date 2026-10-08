import { DOMAINS } from '@sysarch/shared';
import type { KeyboardEvent } from 'react';
import { drillPath } from '../canvas/viewModel';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';

const TABS = [
  ...DOMAINS.map((d) => ({ id: d, label: tr.domain[d], channel: `var(--ch-${d})` })),
  { id: 'overview', label: tr.view.overview, channel: 'var(--ink)' },
];

/** The editor's view tabs, bound to the store. */
export function ViewTabs() {
  // Inside a component, the tab it was opened from stays marked.
  const active = useEditor((s) => drillPath(s.doc, s.activeViewId)?.domain ?? s.activeViewId);
  const setActive = useEditor((s) => s.setActiveView);
  return <ViewTabList active={active} onSelect={setActive} />;
}

/** Domain tabs carry their channel color as a dot and active underline. */
export function ViewTabList({
  active,
  onSelect: setActive,
}: {
  active: string;
  onSelect: (viewId: string) => void;
}) {
  // Arrow keys move between tabs, per the WAI-ARIA tabs pattern.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === active);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
    setActive(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <nav role="tablist" aria-label={tr.view.tabs} className="flex" onKeyDown={onKeyDown}>
      {TABS.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setActive(t.id)}
            className="flex items-center gap-2 border-b-2 px-3 text-base text-ink-muted aria-selected:text-ink"
            style={{ borderBottomColor: selected ? t.channel : 'transparent' }}
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={
                t.id === 'overview'
                  ? { boxShadow: `inset 0 0 0 1.5px ${t.channel}` }
                  : { background: t.channel }
              }
            />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
