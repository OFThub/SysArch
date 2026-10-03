import { Fragment, useMemo } from 'react';
import { drillPath } from '../canvas/viewModel';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';

/** Where an open drill view sits; every step but the last goes back up. */
export function Breadcrumb() {
  const doc = useEditor((s) => s.doc);
  const viewId = useEditor((s) => s.activeViewId);
  const path = useMemo(() => drillPath(doc, viewId), [doc, viewId]);
  if (!path) return null;
  const { setActiveView, drillInto } = useEditor.getState();

  return (
    <nav
      aria-label={tr.drill.path}
      className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-panel px-4 text-sm"
    >
      <button onClick={() => setActiveView(path.domain)} className="text-ink-muted hover:text-ink">
        {tr.domain[path.domain]}
      </button>
      {path.nodes.map((n, i) => (
        <Fragment key={n.id}>
          <span aria-hidden className="text-line">
            /
          </span>
          {i === path.nodes.length - 1 ? (
            <span aria-current="page" className="font-medium">
              {n.label}
            </span>
          ) : (
            <button onClick={() => drillInto(n.id)} className="text-ink-muted hover:text-ink">
              {n.label}
            </button>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
