import { seraIot } from '@sysarch/shared';
import { Background, BackgroundVariant, ReactFlow, type FitViewOptions } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { ArchNodeView } from '../canvas/ArchNodeView';
import { buildFlow } from '../canvas/viewModel';
import { WireEdge } from '../canvas/WireEdge';
import { tr } from '../i18n/tr';
import { SignInButtons } from '../ui/SignInButtons';

const nodeTypes = { arch: ArchNodeView };
const edgeTypes = { wire: WireEdge };

/**
 * No marketing page: the product itself, a real read-only architecture, sits
 * behind a single sign-in panel.
 */
export function LoginScreen() {
  const backdrop = useMemo(() => buildFlow(seraIot(), 'hardware'), []);
  // Wide screens put the panel on the left and fit the diagram beside it, so
  // the product stays readable instead of disappearing behind the panel.
  const [fit] = useState<FitViewOptions>(() =>
    window.matchMedia('(min-width: 64rem)').matches
      ? { padding: { top: 0.1, bottom: 0.1, right: '4%', left: '512px' } }
      : { padding: 0.15 },
  );

  return (
    <div className="relative h-full">
      <div aria-hidden className="absolute inset-0 opacity-70">
        <ReactFlow
          nodes={backdrop.nodes}
          edges={backdrop.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={fit}
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

      <main className="relative flex h-full items-center justify-center p-6 lg:justify-start lg:pl-16">
        <section className="w-full max-w-sm rounded-float border border-line bg-raised p-7 shadow-float">
          <h1 className="font-wide text-xl font-semibold">{tr.login.title}</h1>
          <p className="mt-2 text-base text-ink-muted">{tr.login.lead}</p>

          <div className="mt-6">
            <SignInButtons />
          </div>
        </section>
      </main>
    </div>
  );
}
