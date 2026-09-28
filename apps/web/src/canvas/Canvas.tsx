import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useCallback, useMemo, useState } from 'react';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';
import { ArchNodeView } from './ArchNodeView';
import { FrameNode } from './FrameNode';
import { buildFlow, type ArchFlowEdge, type ArchFlowNode, type FrameFlowNode } from './viewModel';

const nodeTypes = { arch: ArchNodeView, frame: FrameNode };
const FRAME_PAD = 32;
const FRAME_HEADER = 28;

/** Transient per-node state React Flow owns between store writes. */
type NodeOverlay = Pick<Node, 'measured' | 'selected' | 'dragging' | 'position'>;

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const viewId = useEditor((s) => s.activeViewId);
  const moveNodes = useEditor((s) => s.moveNodes);

  const model = useMemo(() => buildFlow(doc, viewId), [doc, viewId]);

  // React Flow reports measurements, selection and in-flight drag positions as
  // changes. They live here, layered over the store-derived nodes; positions
  // reach the store only on drag stop, as one write.
  const [nodeOverlay, setNodeOverlay] = useState(() => new Map<string, Partial<NodeOverlay>>());
  const [selectedEdges, setSelectedEdges] = useState(() => new Set<string>());

  const nodes = useMemo(() => {
    const arch: ArchFlowNode[] = model.nodes.map((n) => {
      const o = nodeOverlay.get(n.id);
      return o ? { ...n, ...o } : n;
    });
    return [...framesAround(model.frames, arch), ...arch];
  }, [model, nodeOverlay]);

  const edges = useMemo<ArchFlowEdge[]>(
    () => model.edges.map((e) => (selectedEdges.has(e.id) ? { ...e, selected: true } : e)),
    [model.edges, selectedEdges],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodeOverlay((prev) => {
      const next = new Map(prev);
      const patch = (id: string, p: Partial<NodeOverlay>) =>
        next.set(id, { ...next.get(id), ...p });
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) patch(c.id, { measured: c.dimensions });
        else if (c.type === 'select') patch(c.id, { selected: c.selected });
        else if (c.type === 'position' && c.position)
          patch(c.id, { position: c.position, dragging: c.dragging });
      }
      return next;
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelectedEdges((prev) => {
      const next = new Set(prev);
      for (const c of changes) {
        if (c.type !== 'select') continue;
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) => {
      moveNodes(viewId, Object.fromEntries(dragged.map((n) => [n.id, n.position])));
      setNodeOverlay((prev) => {
        const next = new Map(prev);
        for (const n of dragged) {
          const { position: _p, dragging: _d, ...rest } = next.get(n.id) ?? {};
          next.set(n.id, rest);
        }
        return next;
      });
    },
    [moveNodes, viewId],
  );

  return (
    <div className="relative h-full">
      <ReactFlow
        key={viewId}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        fitView
        minZoom={0.2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1.5}
          color="var(--canvas-dot)"
          bgColor="var(--canvas)"
        />
      </ReactFlow>
      {model.nodes.length === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-ink-muted">
          {tr.canvas.empty}
        </p>
      )}
    </div>
  );
}

/** Domain frames wrap the measured bounds of their nodes; skipped until all are measured. */
function framesAround(
  frames: { domain: FrameFlowNode['data']['domain']; nodeIds: string[] }[],
  nodes: ArchFlowNode[],
): FrameFlowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return frames.flatMap(({ domain, nodeIds }) => {
    const members = nodeIds.map((id) => byId.get(id));
    if (members.some((n) => !n?.measured?.width || !n.measured.height)) return [];
    const rects = members.map((n) => ({
      x: n!.position.x,
      y: n!.position.y,
      r: n!.position.x + n!.measured!.width!,
      b: n!.position.y + n!.measured!.height!,
    }));
    const x = Math.min(...rects.map((r) => r.x)) - FRAME_PAD;
    const y = Math.min(...rects.map((r) => r.y)) - FRAME_PAD - FRAME_HEADER;
    const width = Math.max(...rects.map((r) => r.r)) + FRAME_PAD - x;
    const height = Math.max(...rects.map((r) => r.b)) + FRAME_PAD - y;
    return [
      {
        id: `frame:${domain}`,
        type: 'frame' as const,
        position: { x, y },
        width,
        height,
        data: { domain },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      },
    ];
  });
}
