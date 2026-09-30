import type { ElkExtendedEdge, ElkNode, ELK } from 'elkjs/lib/elk-api';
import type { FlowModel } from './viewModel';

type Size = { width: number; height: number };
type Point = { x: number; y: number };

// Until a node is measured, assume the terminal block's typical footprint.
const FALLBACK_SIZE: Size = { width: 208, height: 80 };

const ROOT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '96',
  'elk.spacing.nodeNode': '40',
  'elk.spacing.componentComponent': '64',
  // Overview: lay domain groups and their members out in one pass.
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
};

// Room for the frame's padding and domain label (see framesAround in Canvas).
const GROUP_OPTIONS = { 'elk.padding': '[top=60,left=32,bottom=32,right=32]' };

/**
 * The view as an ELK graph. Pads become ports pinned to their side in their
 * drawn order, so layout minimises crossings for the wiring you actually see.
 * In the overview each domain is a compound node, keeping its frame compact.
 */
export function toElkGraph(model: FlowModel, sizes: ReadonlyMap<string, Size>): ElkNode {
  const toElkNode = (n: FlowModel['nodes'][number]): ElkNode => {
    const size = sizes.get(n.id) ?? FALLBACK_SIZE;
    const pads = [
      ...n.data.pads.in.map((p) => ({ ...p, side: 'WEST' })),
      ...n.data.pads.out.map((p) => ({ ...p, side: 'EAST' })),
    ];
    return {
      id: n.id,
      width: size.width,
      height: size.height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' },
      ports: pads.map((p, i) => ({
        id: `${n.id}::${p.id}`,
        width: 8,
        height: 8,
        layoutOptions: { 'elk.port.side': p.side, 'elk.port.index': String(i) },
      })),
    };
  };

  const edges: ElkExtendedEdge[] = model.edges.map((e) => ({
    id: e.id,
    sources: [`${e.source}::${e.sourceHandle}`],
    targets: [`${e.target}::${e.targetHandle}`],
  }));

  const grouped = new Set(model.frames.flatMap((f) => f.nodeIds));
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  return {
    id: 'root',
    layoutOptions: ROOT_OPTIONS,
    children: [
      ...model.frames.map((f) => ({
        id: `group:${f.domain}`,
        layoutOptions: GROUP_OPTIONS,
        children: f.nodeIds.map((id) => toElkNode(byId.get(id)!)),
      })),
      ...model.nodes.filter((n) => !grouped.has(n.id)).map(toElkNode),
    ],
    edges,
  };
}

/** Absolute top-left positions of every laid-out node; group offsets are folded in. */
export function positionsFrom(graph: ElkNode): Record<string, Point> {
  const out: Record<string, Point> = {};
  const walk = (node: ElkNode, ox: number, oy: number) => {
    for (const child of node.children ?? []) {
      const x = ox + (child.x ?? 0);
      const y = oy + (child.y ?? 0);
      if (child.id.startsWith('group:')) walk(child, x, y);
      else out[child.id] = { x: Math.round(x), y: Math.round(y) };
    }
  };
  walk(graph, 0, 0);
  return out;
}

export async function layoutPositions(
  elk: Pick<ELK, 'layout'>,
  model: FlowModel,
  sizes: ReadonlyMap<string, Size>,
): Promise<Record<string, Point>> {
  return positionsFrom(await elk.layout(toElkGraph(model, sizes)));
}
