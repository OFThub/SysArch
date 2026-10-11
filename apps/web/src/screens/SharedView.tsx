import { Background, BackgroundVariant, ReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { authClient, readShared, type Shared } from '../api/client';
import { viewForIssue } from '../analysis/issues';
import { ArchNodeView } from '../canvas/ArchNodeView';
import { FrameNode } from '../canvas/FrameNode';
import { buildFlow, type ArchFlowEdge, type ArchFlowNode } from '../canvas/viewModel';
import { WireEdge } from '../canvas/WireEdge';
import { CommentsPanel } from '../comments/CommentsPanel';
import { loadComments } from '../comments/store';
import type { Target } from '../comments/threads';
import { tr } from '../i18n/tr';
import { ThemeSwitch } from '../shell/ThemeSwitch';
import { ViewTabList } from '../shell/ViewTabs';
import { SignInButtons } from '../ui/SignInButtons';

const nodeTypes = { arch: ArchNodeView, frame: FrameNode };
const edgeTypes = { wire: WireEdge };

/**
 * A design opened from a share link: the same canvas and tabs as the
 * editor, read-only, for anyone holding the link. Nothing here can change
 * the design; the server would refuse it anyway. When the owner allows
 * comments, the link also shows them, and a signed-in visitor can pick a
 * component and comment on it.
 */
export function SharedView({ token }: { token: string }) {
  const [shared, setShared] = useState<Shared | 'missing' | null>(null);
  const [viewId, setViewId] = useState('overview');
  const [picked, setPicked] = useState<Target>({ kind: 'project' });
  const { data: session, isPending } = authClient.useSession();
  const flowApi = useRef<ReactFlowInstance<ArchFlowNode, ArchFlowEdge> | null>(null);
  const commenting = !!shared && shared !== 'missing' && shared.comments;
  const viewer = session?.user.id;

  useEffect(() => {
    let live = true;
    readShared(token)
      .then((r) => live && setShared(r ?? 'missing'))
      .catch(() => live && setShared('missing'));
    return () => {
      live = false;
    };
  }, [token]);

  // Reloaded when the reader signs in or out: what they may delete changes.
  useEffect(() => {
    if (!commenting || isPending) return;
    void loadComments({ token });
    return () => void loadComments(null);
  }, [commenting, isPending, token, viewer]);

  const flow = useMemo(
    () => (shared && shared !== 'missing' ? buildFlow(shared.doc, viewId) : null),
    [shared, viewId],
  );
  // The picked item drawn as selected; React Flow's own selection stays off.
  const nodes = useMemo(
    (): ArchFlowNode[] | undefined =>
      flow?.nodes.map((n) => ({ ...n, selected: picked.kind === 'node' && picked.id === n.id })),
    [flow, picked],
  );
  const edges = useMemo(
    (): ArchFlowEdge[] | undefined =>
      flow?.edges.map((e) => ({
        ...e,
        selected: picked.kind === 'edge' && picked.id === e.data?.edge.id,
      })),
    [flow, picked],
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

  const show = (target: Target) => {
    if (target.kind === 'project') return;
    const edge =
      target.kind === 'edge' ? shared.doc.edges.find((e) => e.id === target.id) : undefined;
    const ids = target.kind === 'node' ? [target.id] : edge ? [edge.source, edge.target] : [];
    if (!ids.length) return;
    const view = viewForIssue(shared.doc, viewId, { nodeIds: ids });
    setViewId(view);
    setPicked(target);
    // After a view switch the canvas remounts; give it a moment to measure.
    setTimeout(
      () =>
        void flowApi.current?.fitView({
          nodes: ids.map((id) => ({ id })),
          padding: 0.5,
          duration: 200,
        }),
      view === viewId ? 0 : 80,
    );
  };

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
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ReactFlow
            key={viewId}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(api) => (flowApi.current = api)}
            onNodeClick={(_, n) =>
              commenting && n.type === 'arch' && setPicked({ kind: 'node', id: n.id })
            }
            onEdgeClick={(_, e) =>
              commenting && e.data && setPicked({ kind: 'edge', id: e.data.edge.id })
            }
            onPaneClick={() => setPicked({ kind: 'project' })}
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
        {commenting && (
          <aside
            aria-label={tr.comments.tab}
            className="flex w-[22rem] shrink-0 flex-col border-l border-line bg-panel"
          >
            <h2 className="flex h-9 shrink-0 items-center border-b border-line px-4 text-sm">
              {tr.comments.tab}
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CommentsPanel
                doc={shared.doc}
                focus={picked}
                canWrite={!!session}
                canResolve={false}
                onShow={show}
                signIn={
                  !isPending && (
                    <div className="border-b border-line p-4">
                      <p className="mb-3 text-sm text-ink-muted">{tr.comments.signIn}</p>
                      <SignInButtons />
                    </div>
                  )
                }
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
