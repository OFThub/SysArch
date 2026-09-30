import { useState } from 'react';
import { tr } from '../i18n/tr';
import { Inspector } from '../panels/Inspector';
import { ProposalPanel } from '../proposals/ProposalPanel';
import { closeProposal, useProposals } from '../proposals/store';

type Tab = 'inspector' | 'proposals';

/** Right column: properties of the selection, or proposals waiting for approval. */
export function SidePanel() {
  const [tab, setTab] = useState<Tab>('inspector');
  const pending = useProposals((s) => s.list.length);

  const select = (next: Tab) => {
    // A preview only makes sense while its proposal is on screen.
    if (next !== 'proposals') closeProposal();
    setTab(next);
  };

  return (
    <aside
      aria-label={tr.side.tabs}
      className="flex w-80 shrink-0 flex-col border-l border-line bg-panel"
    >
      <div role="tablist" className="flex h-9 shrink-0 border-b border-line px-2">
        {(['inspector', 'proposals'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => select(t)}
            className="flex items-center gap-2 border-b-2 border-transparent px-3 text-sm text-ink-muted aria-selected:border-ink aria-selected:text-ink"
          >
            {t === 'inspector' ? tr.inspector.title : tr.proposals.tab}
            {t === 'proposals' && pending > 0 && <span className="tabular-nums">{pending}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'inspector' ? <Inspector /> : <ProposalPanel />}
      </div>
    </aside>
  );
}
