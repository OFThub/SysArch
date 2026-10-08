import type { ArchDoc } from '@sysarch/shared';
import { Background, BackgroundVariant, ReactFlow } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { readShared } from '../api/client';
import { ArchNodeView } from '../canvas/ArchNodeView';
import { FrameNode } from '../canvas/FrameNode';
import { buildFlow } from '../canvas/viewModel';
import { WireEdge } from '../canvas/WireEdge';
import { tr } from '../i18n/tr';
import { ThemeSwitch } from '../shell/ThemeSwitch';
import { ViewTabList } from '../shell/ViewTabs';

const nodeTypes = { arch: ArchNodeView, frame: FrameNode };
const edgeTypes = { wire: WireEdge };

/**
 * A design opened from a share link: the same canvas and tabs as the
 * editor, read-only, for anyone holding the link. Nothing here can change
 * the design; the server would refuse it anyway.
 */
export function SharedView({ token }: { token: string }) {
  const [shared, setShared] = useState<{ name: string; doc: ArchDoc } | 'missing' | null>(null);
  const [viewId, setViewId] = useState('overview');

  useEffect(() => {
    let live = true;
    readShared(token)
      .then((r) => live && setShared(r ?? 'missing'))
      .catch(() => live && setShared('missing'));
    return () => {
      live = false;
    };
  }, [token]);

  const flow = useMemo(
    () => (shared && shared !== 'missing' ? buildFlow(shared.doc, viewId) : null),
    [shared, viewId],
  );

  if (shared === null)
    return <p className="h-full bg-canvas p-6 text-ink-muted">{tr.share.loading}</p>;
  if (shared === 'missing' || !flow)
    return (
      <main className="flex h-full items-center justify-center bg-canvas p-6">
        <section className="w-full max-w-sm rounded-float border border-line bg-raised p-7 shadow-float">
          <p>{tr.share.missing}</p>
          <a href="/" className="mt-4 inline-block text-sm underline">
            {tr.share.home}
          </a>
        </section>
      </main>
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-stretch gap-6 border-b border-line bg-panel px-4">
        <div className="flex items-center gap-2">
          <h1 className="font-wide text-md font-semibold">{shared.name}</h1>
          <span className="rounded-chip border border-line px-1.5 text-xs text-ink-muted">
            {tr.share.readOnly}
          </span>
        </div>
        <ViewTabList active={viewId} onSelect={setViewId} />
        <div className="ml-auto flex items-center">
          <ThemeSwitch />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ReactFlow
          key={viewId}
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1.5}
            color="var(--canvas-dot)"
            bgColor="var(--canvas)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
