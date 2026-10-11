import { lazy, Suspense } from 'react';
import { create } from 'zustand';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { EditorComments } from '../comments/CommentsPanel';
import { useComments } from '../comments/store';
import { tr } from '../i18n/tr';
import { Inspector } from '../panels/Inspector';
import { ProposalPanel } from '../proposals/ProposalPanel';
import { closeProposal, useProposals } from '../proposals/store';

// Monaco is large; it loads the first time the code tab opens.
const CodePanel = lazy(() => import('../code/CodePanel'));

type Tab = 'inspector' | 'assistant' | 'proposals' | 'comments' | 'code';
const TABS: Tab[] = ['inspector', 'assistant', 'proposals', 'comments', 'code'];

// A store, not component state, so the chat can open a proposal's tab.
const useSideTab = create<{ tab: Tab }>(() => ({ tab: 'inspector' }));

export function showSideTab(tab: Tab) {
  // A preview only makes sense while its proposal is on screen.
  if (tab !== 'proposals') closeProposal();
  useSideTab.setState({ tab });
}

/**
 * Right column: properties of the selection, the assistant chat, proposals
 * to approve, comment threads, or the design as code.
 */
export function SidePanel() {
  const tab = useSideTab((s) => s.tab);
  const pending = useProposals((s) => s.list.length);
  const openComments = useComments(
    (s) => s.list.filter((c) => !c.parentId && !c.resolvedAt).length,
  );
  const code = tab === 'code';
  const label = {
    inspector: tr.inspector.title,
    assistant: tr.assistant.tab,
    proposals: tr.proposals.tab,
    comments: tr.comments.tab,
    code: tr.code.tab,
  };
  const count = { proposals: pending, comments: openComments } as Partial<Record<Tab, number>>;

  return (
    <aside
      aria-label={tr.side.tabs}
      // Code needs room to read; the column widens while it is open.
      className={`flex shrink-0 flex-col border-l border-line bg-panel transition-[width] duration-120 motion-reduce:transition-none ${code ? 'w-[36rem]' : 'w-[22rem]'}`}
    >
      <div role="tablist" className="flex h-9 shrink-0 border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => showSideTab(t)}
            className="flex items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm text-ink-muted aria-selected:border-ink aria-selected:text-ink"
          >
            {label[t]}
            {!!count[t] && <span className="tabular-nums">{count[t]}</span>}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        className={`min-h-0 flex-1 ${code ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {tab === 'inspector' ? (
          <Inspector />
        ) : tab === 'assistant' ? (
          <AssistantPanel />
        ) : tab === 'proposals' ? (
          <ProposalPanel />
        ) : tab === 'comments' ? (
          <EditorComments />
        ) : (
          <Suspense fallback={<p className="p-4 text-sm text-ink-muted">{tr.code.loading}</p>}>
            <CodePanel />
          </Suspense>
        )}
      </div>
    </aside>
  );
}
