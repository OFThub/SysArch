import { newIssues } from '@sysarch/shared';
import { ChevronLeft } from 'lucide-react';
import { useMemo } from 'react';
import { issueText } from '../analysis/issues';
import { tr } from '../i18n/tr';
import { useCatalog, useEditor } from '../store';
import { SeverityIcon } from '../ui/SeverityIcon';
import { SectionTitle } from '../ui/controls';
import { describeOp } from './preview';
import {
  applyOpen,
  closeProposal,
  openProposal,
  rejectOpen,
  toggleOp,
  usePreview,
  useProposals,
  type OpenPreview,
} from './store';

/** Pending proposals and, for the open one, its changes to approve one by one. */
export function ProposalPanel() {
  const list = useProposals((s) => s.list);
  const notice = useProposals((s) => s.notice);
  const preview = usePreview();

  return (
    <div className="grid gap-3 p-4">
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="flex items-start gap-2 text-sm"
        >
          {notice.tone === 'error' && <SeverityIcon severity="error" />}
          {notice.text}
        </p>
      )}
      {preview ? (
        <ProposalDetail preview={preview} />
      ) : list.length === 0 ? (
        <p className="text-sm text-ink-muted">{tr.proposals.empty}</p>
      ) : (
        <ul className="grid gap-2">
          {list.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => openProposal(p.id)}
                className="grid w-full gap-1 rounded-chip border border-line bg-raised p-3 text-left hover:border-ink-muted"
              >
                <span className="line-clamp-3 text-sm">{p.summary}</span>
                <span className="flex justify-between text-xs text-ink-muted">
                  <span>{tr.proposals.source[p.source]}</span>
                  <span className="tabular-nums">{tr.proposals.changes(p.ops.length)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalDetail({ preview }: { preview: OpenPreview }) {
  const { proposal } = preview;
  const doc = useEditor((s) => s.doc);
  const catalog = useCatalog();
  const accepted = useProposals((s) => s.accepted);
  const conflicts = useProposals((s) => s.conflicts);
  const busy = useProposals((s) => s.busy);

  // Live against the doc as it is now and the ops still checked.
  const introduced = useMemo(() => newIssues(doc, preview.after), [doc, preview.after]);
  const failing = new Map([...preview.errors, ...conflicts].map((e) => [e.index, e.message]));

  return (
    <>
      <button
        onClick={closeProposal}
        className="flex items-center gap-0.5 justify-self-start text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
        {tr.proposals.back}
      </button>
      <p className="text-base">{proposal.summary}</p>
      <p className="text-xs text-ink-muted">{tr.proposals.previewing}</p>

      <SectionTitle>{tr.proposals.select}</SectionTitle>
      <ul className="grid gap-1.5">
        {proposal.ops.map((op, i) => {
          const problem = failing.get(i);
          return (
            <li key={i} className="grid gap-0.5">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accepted.includes(i)}
                  onChange={(e) => toggleOp(i, e.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--ink)]"
                />
                <span>{describeOp(op, doc, preview.after, catalog)}</span>
              </label>
              {problem && (
                <span className="flex items-start gap-1.5 pl-6 text-xs" title={problem}>
                  <SeverityIcon severity="error" size={12} />
                  {tr.proposals.conflict}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <SectionTitle>{tr.proposals.newIssues}</SectionTitle>
      {introduced.length === 0 ? (
        <p className="text-sm text-ink-muted">{tr.proposals.noNewIssues}</p>
      ) : (
        <ul className="grid gap-1.5">
          {introduced.map((issue) => (
            <li key={issue.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">
                <SeverityIcon severity={issue.severity} />
              </span>
              {issueText(issue).message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => void applyOpen()}
          disabled={busy || accepted.length === 0 || failing.size > 0}
          className="h-8 rounded-chip bg-ink px-3 text-sm font-medium text-raised disabled:opacity-50"
        >
          {tr.proposals.apply}
        </button>
        <button
          onClick={() => void rejectOpen()}
          disabled={busy}
          className="h-8 rounded-chip border border-line bg-raised px-3 text-sm hover:border-ink-muted disabled:opacity-50"
        >
          {tr.proposals.reject}
        </button>
      </div>
      {accepted.length === 0 && (
        <p className="text-xs text-ink-muted">{tr.proposals.nothingSelected}</p>
      )}
    </>
  );
}
