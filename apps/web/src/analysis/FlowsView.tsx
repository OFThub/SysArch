import { chainEdges, flowTrace, newId, type Flow } from '@sysarch/shared';
import { useState } from 'react';
import { canvasApi } from '../canvas/canvasApi';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';
import { NumberInput } from '../ui/controls';
import { SeverityIcon } from '../ui/SeverityIcon';
import { viewForIssue } from './issues';
import { playFlow, stopFlow, usePlayback } from './playback';

const fmt = new Intl.NumberFormat('tr', { maximumFractionDigits: 1 });

/** Flows: named paths through the design, timed end to end against a target. */
export function FlowsView() {
  const flows = useEditor((s) => s.doc.flows);
  const selected = useEditor((s) => s.selection.edgeIds);
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    const { doc, setFlow } = useEditor.getState();
    const steps = chainEdges(doc, selected);
    if (!steps) return setError(tr.flows.notPath);
    setError(null);
    setFlow({ id: newId(), name: tr.flows.defaultName(doc.flows.length + 1), steps });
  };

  return (
    <div className="grid gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={create}
          disabled={selected.length === 0}
          className="h-7 rounded-chip border border-line bg-raised px-2.5 text-sm hover:border-ink-muted disabled:opacity-50"
        >
          {tr.flows.create}
        </button>
        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm">
            <SeverityIcon severity="warning" />
            {error}
          </p>
        )}
      </div>
      {flows.length === 0 ? (
        <p className="text-sm text-ink-muted">{tr.flows.empty}</p>
      ) : (
        <ul className="grid">
          {flows.map((f) => (
            <FlowRow key={f.id} flow={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FlowRow({ flow }: { flow: Flow }) {
  const doc = useEditor((s) => s.doc);
  const playing = usePlayback((s) => s.flowId === flow.id);
  const trace = flowTrace(doc, flow);
  const broken = trace.brokenAt !== undefined;
  const over = !broken && flow.slaMs !== undefined && trace.totalMs > flow.slaMs;
  const { setFlow, removeFlow } = useEditor.getState();

  // Brings the flow on screen: its tab (the overview when it crosses domains) and its links.
  const show = () => {
    const { activeViewId, setActiveView, setSelection } = useEditor.getState();
    const view = viewForIssue(doc, activeViewId, { nodeIds: trace.nodeIds });
    if (view !== activeViewId) setActiveView(view);
    setSelection({ nodeIds: [], edgeIds: flow.steps });
    setTimeout(() => canvasApi.fitNodes(trace.nodeIds), view === activeViewId ? 0 : 80);
  };

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-line py-2 first:border-t-0">
      <input
        aria-label={tr.flows.name}
        value={flow.name}
        onChange={(e) => setFlow({ ...flow, name: e.target.value })}
        onBlur={(e) =>
          !e.target.value.trim() && setFlow({ ...flow, name: tr.flows.defaultName(1) })
        }
        className="h-7 w-44 rounded-chip border border-line bg-raised px-2 text-sm"
      />
      <span className="text-sm text-ink-muted tabular-nums">
        {tr.flows.steps(flow.steps.length)}
      </span>
      <span className="text-sm text-ink-muted">
        {tr.flows.total}{' '}
        <span className="text-ink tabular-nums">{fmt.format(trace.totalMs)} ms</span>
      </span>
      <label className="flex items-center gap-1.5 text-sm text-ink-muted">
        {tr.flows.sla}
        <span className="w-20">
          <NumberInput
            value={flow.slaMs}
            onCommit={(v) => {
              const { slaMs: _, ...rest } = flow;
              setFlow(v === undefined || v <= 0 ? rest : { ...rest, slaMs: v });
            }}
          />
        </span>
        ms
      </label>
      {(broken || over) && (
        <span className="flex items-center gap-1 text-sm">
          <SeverityIcon severity="warning" />
          {broken ? tr.flows.broken : tr.flows.over}
        </span>
      )}
      <span className="ml-auto flex gap-2">
        <RowButton onClick={show}>{tr.flows.show}</RowButton>
        <RowButton
          disabled={broken}
          onClick={() => {
            if (playing) return stopFlow();
            show();
            playFlow(flow.id, flow.steps.length);
          }}
        >
          {playing ? tr.flows.stop : tr.flows.play}
        </RowButton>
        <RowButton onClick={() => removeFlow(flow.id)}>{tr.flows.remove}</RowButton>
      </span>
    </li>
  );
}

function RowButton(props: { onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      {...props}
      className="h-7 rounded-chip border border-line bg-raised px-2.5 text-sm hover:border-ink-muted disabled:opacity-50"
    />
  );
}
