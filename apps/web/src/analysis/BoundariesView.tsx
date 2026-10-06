import { newId, type Boundary } from '@sysarch/shared';
import { canvasApi } from '../canvas/canvasApi';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';
import { Select } from '../ui/controls';
import { RowButton } from './FlowsView';
import { viewForIssue } from './issues';

const TRUST: Boundary['trust'][] = ['internet', 'dmz', 'device', 'internal'];

/**
 * Trust boundaries: zones of components that trust each other alike. Built
 * from the canvas selection; the STRIDE rules then check every link that
 * crosses from one zone into a differently trusted one.
 */
export function BoundariesView() {
  const boundaries = useEditor((s) => s.doc.boundaries);
  const selected = useEditor((s) => s.selection.nodeIds);
  const t = tr.threats;

  const create = () => {
    const { doc, setBoundary } = useEditor.getState();
    setBoundary({
      id: newId(),
      name: t.defaultName(doc.boundaries.length + 1),
      trust: 'internal',
      nodeIds: selected,
    });
  };

  return (
    <div className="grid content-start gap-3 p-4">
      <h3 className="text-xs font-medium text-ink-muted">{t.boundaries}</h3>
      <div>
        <button
          onClick={create}
          disabled={selected.length === 0}
          className="h-7 rounded-chip border border-line bg-raised px-2.5 text-sm hover:border-ink-muted disabled:opacity-50"
        >
          {t.create}
        </button>
      </div>
      {boundaries.length === 0 ? (
        <p className="text-sm text-ink-muted">{t.noBoundaries}</p>
      ) : (
        <ul>
          {boundaries.map((b) => (
            <BoundaryRow key={b.id} boundary={b} selected={selected} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BoundaryRow({ boundary: b, selected }: { boundary: Boundary; selected: string[] }) {
  const { setBoundary, removeBoundary } = useEditor.getState();
  const t = tr.threats;

  const show = () => {
    const { doc, activeViewId, setActiveView, setSelection } = useEditor.getState();
    const view = viewForIssue(doc, activeViewId, { nodeIds: b.nodeIds });
    if (view !== activeViewId) setActiveView(view);
    setSelection({ nodeIds: b.nodeIds, edgeIds: [] });
    setTimeout(() => canvasApi.fitNodes(b.nodeIds), view === activeViewId ? 0 : 80);
  };

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-line py-2 first:border-t-0">
      <input
        aria-label={t.name}
        value={b.name}
        onChange={(e) => setBoundary({ ...b, name: e.target.value })}
        onBlur={(e) => !e.target.value.trim() && setBoundary({ ...b, name: t.defaultName(1) })}
        className="h-7 w-36 rounded-chip border border-line bg-raised px-2 text-sm"
      />
      <span className="w-28">
        <Select
          aria-label={t.trustLabel}
          value={b.trust}
          onChange={(e) => setBoundary({ ...b, trust: e.target.value as Boundary['trust'] })}
          options={TRUST.map((v) => ({ value: v, label: t.trust[v] }))}
        />
      </span>
      <span className="text-sm text-ink-muted tabular-nums">{t.members(b.nodeIds.length)}</span>
      <span className="ml-auto flex gap-2">
        <RowButton
          disabled={selected.length === 0}
          onClick={() => setBoundary({ ...b, nodeIds: [...new Set([...b.nodeIds, ...selected])] })}
        >
          {t.addSelected}
        </RowButton>
        <RowButton onClick={show}>{t.show}</RowButton>
        <RowButton onClick={() => removeBoundary(b.id)}>{t.remove}</RowButton>
      </span>
    </li>
  );
}
