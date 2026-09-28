import { connectNodes, ProtocolSchema, type Protocol } from '@sysarch/shared';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { tr } from '../i18n/tr';
import { createNode } from '../panels/paletteItems';
import { useCatalog, useEditor } from '../store';
import { ArchNodeView } from './ArchNodeView';
import { canvasApi, DND_MIME } from './canvasApi';
import { CanvasToolbar } from './CanvasToolbar';
import { getElk } from './elk';
import { FrameNode } from './FrameNode';
import { layoutPositions } from './layout';
import {
  archEdgeId,
  buildFlow,
  type ArchFlowEdge,
  type ArchFlowNode,
  type FrameFlowNode,
} from './viewModel';
import { WireEdge } from './WireEdge';

const nodeTypes = { arch: ArchNodeView, frame: FrameNode };
const edgeTypes = { wire: WireEdge };
const FRAME_PAD = 32;
const FRAME_HEADER = 28;

/** Transient per-node state React Flow owns between store writes. */
type NodeOverlay = Pick<Node, 'measured' | 'dragging' | 'position'>;

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const viewId = useEditor((s) => s.activeViewId);
  const selection = useEditor((s) => s.selection);
  const moveNodes = useEditor((s) => s.moveNodes);
  const addNode = useEditor((s) => s.addNode);
  const catalog = useCatalog();
  const container = useRef<HTMLDivElement>(null);

  const model = useMemo(() => buildFlow(doc, viewId), [doc, viewId]);

  // React Flow reports measurements and in-flight drag positions as changes.
  // They live here, layered over the store-derived nodes; positions reach the
  // store only on drag stop, as one write. Selection lives in the store so the
  // inspector and later the palette/assistant can read and set it.
  const [nodeOverlay, setNodeOverlay] = useState(() => new Map<string, Partial<NodeOverlay>>());

  // Auto-layout runs in the ELK worker with the sizes React Flow measured, and
  // lands as one moveNodes write: one render, one undo step.
  const [layingOut, setLayingOut] = useState(false);
  const runLayout = useCallback(async () => {
    const sizes = new Map<string, { width: number; height: number }>();
    for (const [id, o] of nodeOverlay)
      if (o.measured?.width && o.measured.height)
        sizes.set(id, { width: o.measured.width, height: o.measured.height });
    setLayingOut(true);
    try {
      moveNodes(viewId, await layoutPositions(getElk(), model, sizes));
      requestAnimationFrame(() => canvasApi.fitView());
    } finally {
      setLayingOut(false);
    }
  }, [model, nodeOverlay, moveNodes, viewId]);

  // A view where nothing has a position yet (a fresh import, an AI-generated
  // design) is laid out automatically once its nodes are measured. Views the
  // user arranged are never rearranged without the toolbar button.
  const positions = doc.views.find((v) => v.id === viewId)?.positions ?? {};
  const unplaced = model.nodes.length > 0 && model.nodes.every((n) => !positions[n.id]);
  const measured = model.nodes.every((n) => nodeOverlay.get(n.id)?.measured?.width);
  // Once per view: a failing layout must not retry in a loop.
  const autoLaidOut = useRef<string | null>(null);
  useEffect(() => {
    if (!unplaced || !measured || layingOut || autoLaidOut.current === viewId) return;
    autoLaidOut.current = viewId;
    void runLayout();
  }, [unplaced, measured, layingOut, runLayout, viewId]);

  const nodes = useMemo(() => {
    const selected = new Set(selection.nodeIds);
    const arch: ArchFlowNode[] = model.nodes.map((n) => ({
      ...n,
      ...nodeOverlay.get(n.id),
      selected: selected.has(n.id),
    }));
    return [...framesAround(model.frames, arch), ...arch];
  }, [model, nodeOverlay, selection.nodeIds]);

  // Selection is per architecture edge: clicking SDA selects the whole I2C link.
  const edges = useMemo<ArchFlowEdge[]>(() => {
    const selected = new Set(selection.edgeIds);
    return model.edges.map((e) => ({ ...e, selected: selected.has(archEdgeId(e.id)) }));
  }, [model.edges, selection.edgeIds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    applySelect(changes, 'nodeIds', (id) => id);
    setNodeOverlay((prev) => {
      const next = new Map(prev);
      const patch = (id: string, p: Partial<NodeOverlay>) =>
        next.set(id, { ...next.get(id), ...p });
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) patch(c.id, { measured: c.dimensions });
        else if (c.type === 'position' && c.position)
          patch(c.id, { position: c.position, dragging: c.dragging });
      }
      return next;
    });
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => applySelect(changes, 'edgeIds', archEdgeId),
    [],
  );

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

  // A drag that starts on a protocol pad (out:MQTT) keeps that protocol; pins,
  // header handles and everything else let connectNodes choose.
  const onConnect = useCallback(
    (c: Connection) => {
      const { doc: d, addEdge } = useEditor.getState();
      const source = d.nodes.find((n) => n.id === c.source);
      const target = d.nodes.find((n) => n.id === c.target);
      if (!source || !target || source.id === target.id) return;
      const preferred = padProtocol(c.sourceHandle) ?? padProtocol(c.targetHandle);
      addEdge(connectNodes(source, target, catalog, preferred));
    },
    [catalog],
  );

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    e.preventDefault();
    const item = JSON.parse(raw) as { kind: 'type' | 'preset'; id: string };
    addNode(createNode(item, catalog), viewId, canvasApi.toFlow(e.clientX, e.clientY));
  };

  return (
    <div ref={container} className="relative h-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        key={viewId}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        deleteKeyCode={null}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={(c) => c.source !== c.target}
        connectionLineStyle={{ stroke: 'var(--ink-muted)', strokeWidth: 1.5 }}
        onInit={(instance) => canvasApi.attach(instance, container.current)}
        fitView
        minZoom={0.2}
      >
        <CanvasToolbar onLayout={() => void runLayout()} busy={layingOut} />
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

const PROTOCOL_NAMES = new Set<string>(ProtocolSchema.options);

/** `out:MQTT` → MQTT; pin pads (`in:SDA`) and header handles (`out:new`) → undefined. */
function padProtocol(handle: string | null | undefined): Protocol | undefined {
  const name = handle?.split(':')[1];
  return name && PROTOCOL_NAMES.has(name) ? (name as Protocol) : undefined;
}

/** Folds React Flow's select changes into the store selection. */
function applySelect(
  changes: (NodeChange | EdgeChange)[],
  key: 'nodeIds' | 'edgeIds',
  toArchId: (id: string) => string,
) {
  const selects = changes.filter((c) => c.type === 'select');
  if (selects.length === 0) return;
  const { selection, setSelection } = useEditor.getState();
  const ids = new Set(selection[key]);
  for (const c of selects) {
    if (c.selected) ids.add(toArchId(c.id));
    else ids.delete(toArchId(c.id));
  }
  setSelection({ ...selection, [key]: [...ids] });
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
