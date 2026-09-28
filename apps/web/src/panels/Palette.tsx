import { useMemo, useState, type DragEvent } from 'react';
import { canvasApi, DND_MIME } from '../canvas/canvasApi';
import { tr } from '../i18n/tr';
import { NodeIcon } from '../icons/NodeIcon';
import { useCatalog, useEditor } from '../store';
import { createNode, paletteSections, type PaletteItem } from './paletteItems';

export function Palette() {
  const catalog = useCatalog();
  const activeViewId = useEditor((s) => s.activeViewId);
  const view = useEditor((s) => s.doc.views.find((v) => v.id === s.activeViewId));
  const addNode = useEditor((s) => s.addNode);
  const [query, setQuery] = useState('');

  const domain = view?.kind === 'domain' ? view.domain : undefined;
  const sections = useMemo(() => paletteSections(catalog, domain, query), [catalog, domain, query]);

  // Click (or Enter) adds at the canvas centre: the keyboard path to placing a node.
  const add = (item: PaletteItem) =>
    addNode(createNode(item, catalog), activeViewId, canvasApi.nextFreeCenter());

  return (
    <aside
      aria-label={tr.palette.title}
      className="flex w-60 shrink-0 flex-col border-r border-line bg-panel"
    >
      <div className="grid gap-1.5 border-b border-line p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr.palette.search}
          aria-label={tr.palette.search}
          className="h-7 w-full rounded-chip border border-line bg-raised px-2 text-sm placeholder:text-ink-muted"
        />
        <p className="text-xs text-ink-muted">{tr.palette.hint}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sections.map((s) => (
          <section key={s.domain} className="pt-2">
            {!domain && (
              <h2 className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-ink-muted">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: `var(--ch-${s.domain})` }}
                />
                {tr.domain[s.domain]}
              </h2>
            )}
            <ul>
              {s.types.map((item) => (
                <PaletteRow key={item.key} item={item} onAdd={add} />
              ))}
            </ul>
            {s.presets.length > 0 && (
              <>
                <h3 className="px-2 pt-3 pb-1 text-xs font-medium text-ink-muted">
                  {tr.palette.presets}
                </h3>
                <ul>
                  {s.presets.map((item) => (
                    <PaletteRow key={item.key} item={item} onAdd={add} />
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}
        {sections.length === 0 && (
          <p className="px-2 pt-4 text-sm text-ink-muted">{tr.palette.empty}</p>
        )}
      </div>
    </aside>
  );
}

function PaletteRow({ item, onAdd }: { item: PaletteItem; onAdd: (item: PaletteItem) => void }) {
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: item.kind, id: item.id }));
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <li>
      <button
        draggable
        onDragStart={onDragStart}
        onClick={() => onAdd(item)}
        className="flex w-full cursor-grab items-center gap-2 rounded-chip px-2 py-1.5 text-left text-sm hover:bg-raised active:cursor-grabbing"
      >
        <span className="text-ink-muted">
          <NodeIcon name={item.icon} />
        </span>
        <span className={`truncate ${item.typeLabel ? 'max-w-[65%] shrink-0' : 'min-w-0 flex-1'}`}>
          {item.label}
        </span>
        {item.typeLabel && (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-muted">
            {item.typeLabel}
          </span>
        )}
      </button>
    </li>
  );
}
