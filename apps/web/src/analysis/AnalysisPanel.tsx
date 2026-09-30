import {
  linkLoads,
  nodeLoads,
  pathLatency,
  powerBudgets,
  type Issue,
  type Severity,
} from '@sysarch/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { canvasApi } from '../canvas/canvasApi';
import { tr } from '../i18n/tr';
import { useCatalog, useEditor } from '../store';
import { SeverityIcon } from '../ui/SeverityIcon';
import { issueText, useIssues, viewForIssue } from './issues';

type Tab = 'issues' | 'simulation';
const fmt = new Intl.NumberFormat('tr', { maximumFractionDigits: 1 });
const percent = (u?: number) => (u === undefined ? '—' : `%${Math.round(u * 100)}`);

/** Bottom panel: every finding in one list, and the numbers behind the simulation rules. */
export function AnalysisPanel() {
  const issues = useIssues();
  const [tab, setTab] = useState<Tab>('issues');
  const [open, setOpen] = useState(true);
  const counts = (['error', 'warning', 'info'] as Severity[]).map((s) => ({
    s,
    n: issues.filter((i) => i.severity === s).length,
  }));

  return (
    <section
      aria-label={tr.analysis.title}
      className="flex shrink-0 flex-col border-t border-line bg-panel"
    >
      <div className="flex h-9 items-stretch gap-1 px-2">
        <div role="tablist" className="flex">
          {(['issues', 'simulation'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setOpen(true);
              }}
              className="flex items-center gap-2 border-b-2 border-transparent px-3 text-sm text-ink-muted aria-selected:border-ink aria-selected:text-ink"
            >
              {tr.analysis[t]}
              {t === 'issues' && issues.length > 0 && (
                <span className="tabular-nums">{issues.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm tabular-nums">
          {counts
            .filter((c) => c.n > 0)
            .map((c) => (
              <span key={c.s} className="flex items-center gap-1" title={tr.analysis.severity[c.s]}>
                <SeverityIcon severity={c.s} />
                {c.n}
              </span>
            ))}
          <button
            aria-label={open ? tr.analysis.hide : tr.analysis.show}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex size-7 items-center justify-center text-ink-muted hover:text-ink"
          >
            {open ? (
              <ChevronDown size={16} strokeWidth={1.5} />
            ) : (
              <ChevronUp size={16} strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
      {open && (
        // Sized to its content, so "no issues" costs the canvas one line, not 224px.
        <div className="max-h-56 overflow-y-auto border-t border-line">
          {tab === 'issues' ? <IssueList issues={issues} /> : <SimulationView />}
        </div>
      )}
    </section>
  );
}

function focusIssue(issue: Issue) {
  const { doc, activeViewId, setActiveView, setSelection } = useEditor.getState();
  const view = viewForIssue(doc, activeViewId, issue);
  if (view !== activeViewId) setActiveView(view);
  setSelection({ nodeIds: issue.edgeIds.length ? [] : issue.nodeIds, edgeIds: issue.edgeIds });
  // After a view switch the canvas remounts; give it a moment to measure.
  setTimeout(() => canvasApi.fitNodes(issue.nodeIds), view === activeViewId ? 0 : 80);
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <p className="p-4 text-sm text-ink-muted">{tr.analysis.noIssues}</p>;
  return (
    <ul>
      {issues.map((issue) => {
        const { message, hint } = issueText(issue);
        return (
          <li key={issue.id} className="border-b border-line last:border-b-0">
            <button
              onClick={() => focusIssue(issue)}
              className="flex w-full items-start gap-2.5 px-4 py-2 text-left hover:bg-raised"
            >
              <span className="mt-0.5">
                <SeverityIcon severity={issue.severity} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm">{message}</span>
                {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SimulationView() {
  const doc = useEditor((s) => s.doc);
  const catalog = useCatalog();
  const label = (id: string) => doc.nodes.find((n) => n.id === id)?.label ?? id;
  const links = useMemo(() => linkLoads(doc), [doc]);
  const nodes = useMemo(() => nodeLoads(doc), [doc]);
  const power = useMemo(() => powerBudgets(doc, catalog), [doc, catalog]);
  const t = tr.analysis;

  return (
    <div className="grid gap-6 p-4 md:grid-cols-2">
      <SimTable
        title={t.links}
        empty={t.noLinks}
        head={[t.link, t.demand, t.capacity, t.load]}
        rows={links.map((l) => {
          const e = doc.edges.find((x) => x.id === l.edgeId)!;
          return [
            `${label(e.source)} → ${label(e.target)} (${e.protocol})`,
            `${fmt.format(l.demandKbps)} kbps`,
            l.capacityKbps === undefined ? '—' : `${fmt.format(l.capacityKbps)} kbps`,
            percent(l.utilization),
          ];
        })}
      />
      <SimTable
        title={t.power}
        empty={t.noPower}
        head={[t.source, t.draw, t.limit, t.load, t.battery]}
        rows={power.map((b) => [
          label(b.sourceId),
          `${fmt.format(b.loadMa)} mA`,
          b.maxMa === undefined ? '—' : `${fmt.format(b.maxMa)} mA`,
          percent(b.utilization),
          b.batteryHours === undefined ? '—' : t.hours(fmt.format(b.batteryHours)),
        ])}
      />
      <SimTable
        title={t.nodes}
        empty={t.noNodes}
        head={[t.component, t.incoming, t.capacity, t.load]}
        rows={nodes.map((n) => [
          label(n.nodeId),
          `${fmt.format(n.inRps)} ${t.rps}`,
          `${fmt.format(n.capacityRps ?? 0)} ${t.rps}`,
          percent(n.utilization),
        ])}
      />
      <LatencyTool />
    </div>
  );
}

function SimTable({
  title,
  head,
  rows,
  empty,
}: {
  title: string;
  head: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-ink-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              {head.map((h) => (
                <th key={h} className="py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className={`py-1 pr-3 ${j > 0 ? 'whitespace-nowrap' : ''}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LatencyTool() {
  const doc = useEditor((s) => s.doc);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const result = from && to ? pathLatency(doc, from, to) : undefined;
  const label = (id: string) => doc.nodes.find((n) => n.id === id)?.label ?? id;
  const t = tr.analysis;
  const pick = (value: string, set: (v: string) => void, aria: string) => (
    <select
      aria-label={aria}
      value={value}
      onChange={(e) => set(e.target.value)}
      className="h-7 min-w-0 flex-1 rounded-chip border border-line bg-raised px-2 text-sm"
    >
      <option value="">{aria}</option>
      {doc.nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.label}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-ink-muted">{t.latency}</h3>
      <div className="flex gap-2">
        {pick(from, setFrom, t.from)}
        {pick(to, setTo, t.to)}
      </div>
      {from && to && (
        <div className="mt-2 text-sm">
          {result ? (
            <>
              <p className="font-semibold tabular-nums">{fmt.format(result.totalMs)} ms</p>
              <p className="text-ink-muted">{result.nodeIds.map(label).join(' → ')}</p>
            </>
          ) : (
            <p className="text-ink-muted">{t.noPath}</p>
          )}
        </div>
      )}
    </div>
  );
}
