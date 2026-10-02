import { create } from 'zustand';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { tr } from '../i18n/tr';
import { Inspector } from '../panels/Inspector';
import { ProposalPanel } from '../proposals/ProposalPanel';
import { closeProposal, useProposals } from '../proposals/store';

type Tab = 'inspector' | 'assistant' | 'proposals';
const TABS: Tab[] = ['inspector', 'assistant', 'proposals'];

// A store, not component state, so the chat can open a proposal's tab.
const useSideTab = create<{ tab: Tab }>(() => ({ tab: 'inspector' }));

export function showSideTab(tab: Tab) {
  // A preview only makes sense while its proposal is on screen.
  if (tab !== 'proposals') closeProposal();
  useSideTab.setState({ tab });
}

/** Right column: properties of the selection, the assistant chat, or proposals to approve. */
export function SidePanel() {
  const tab = useSideTab((s) => s.tab);
  const pending = useProposals((s) => s.list.length);
  const label = {
    inspector: tr.inspector.title,
    assistant: tr.assistant.tab,
    proposals: tr.proposals.tab,
  };

  return (
    <aside
      aria-label={tr.side.tabs}
      className="flex w-80 shrink-0 flex-col border-l border-line bg-panel"
    >
      <div role="tablist" className="flex h-9 shrink-0 border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => showSideTab(t)}
            className="flex items-center gap-2 border-b-2 border-transparent px-3 text-sm text-ink-muted aria-selected:border-ink aria-selected:text-ink"
          >
            {label[t]}
            {t === 'proposals' && pending > 0 && <span className="tabular-nums">{pending}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'inspector' ? (
          <Inspector />
        ) : tab === 'assistant' ? (
          <AssistantPanel />
        ) : (
          <ProposalPanel />
        )}
      </div>
    </aside>
  );
}
