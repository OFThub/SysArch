import { seraIot } from '@sysarch/shared';
import { Background, BackgroundVariant, ReactFlow } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { api, authClient } from '../api/client';
import { ArchNodeView } from '../canvas/ArchNodeView';
import { buildFlow } from '../canvas/viewModel';
import { WireEdge } from '../canvas/WireEdge';
import { tr } from '../i18n/tr';

const nodeTypes = { arch: ArchNodeView };
const edgeTypes = { wire: WireEdge };
type Provider = 'github' | 'google';

/**
 * No marketing page: the product itself, a real read-only architecture, sits
 * behind a single sign-in panel.
 */
export function LoginScreen() {
  const [providers, setProviders] = useState<Provider[] | 'unreachable' | null>(null);
  const backdrop = useMemo(() => buildFlow(seraIot(), 'hardware'), []);

  useEffect(() => {
    api.providers
      .$get()
      .then(async (res) => setProviders(res.ok ? (await res.json()).providers : 'unreachable'))
      .catch(() => setProviders('unreachable'));
  }, []);

  const signIn = (provider: Provider) =>
    authClient.signIn.social({ provider, callbackURL: window.location.href });

  return (
    <div className="relative h-full">
      <div aria-hidden className="absolute inset-0 opacity-70">
        <ReactFlow
          nodes={backdrop.nodes}
          edges={backdrop.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
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

      <main className="relative flex h-full items-center justify-center p-6">
        <section className="w-full max-w-sm rounded-float border border-line bg-raised p-7 shadow-float">
          <h1 className="font-wide text-xl font-semibold">{tr.login.title}</h1>
          <p className="mt-2 text-base text-ink-muted">{tr.login.lead}</p>

          <div className="mt-6 grid gap-2">
            {providers === 'unreachable' && (
              <p role="alert" className="text-sm">
                {tr.login.unreachable}
              </p>
            )}
            {Array.isArray(providers) && providers.length === 0 && (
              <p className="text-sm">{tr.login.noProviders}</p>
            )}
            {Array.isArray(providers) &&
              providers.map((p) => (
                <button
                  key={p}
                  onClick={() => void signIn(p)}
                  className="h-9 rounded-chip border border-line bg-panel text-base font-medium hover:border-ink-muted"
                >
                  {tr.login[p]}
                </button>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}
