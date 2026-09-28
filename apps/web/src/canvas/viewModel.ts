import type { ArchDoc, ArchEdge, ArchNode, Domain } from '@sysarch/shared';
import type { Edge, Node } from '@xyflow/react';

export type ArchNodeData = { node: ArchNode; proxy: boolean };
export type ArchFlowNode = Node<ArchNodeData, 'arch'>;
export type FrameData = { domain: Domain };
export type FrameFlowNode = Node<FrameData, 'frame'>;
export type ArchFlowEdge = Edge<{ edge: ArchEdge }>;

export interface FlowModel {
  nodes: ArchFlowNode[];
  edges: ArchFlowEdge[];
  /** Overview only: which nodes each domain frame encloses. */
  frames: { domain: Domain; nodeIds: string[] }[];
}

const FALLBACK_GAP_X = 320;
const FALLBACK_GAP_Y = 140;

/**
 * Derives what one view shows from the doc. Pure: React Flow state is always
 * rebuilt from the store, never kept as a second source of truth.
 *
 * - domain view: that domain's top-level nodes, plus cross-domain neighbours
 *   as faded proxies so interfaces stay visible;
 * - overview: every top-level node, framed by domain;
 * - drill: the children of the view's root node.
 */
export function buildFlow(doc: ArchDoc, viewId: string): FlowModel {
  const view = doc.views.find((v) => v.id === viewId);
  if (!view) return { nodes: [], edges: [], frames: [] };

  const members = doc.nodes.filter((n) =>
    view.kind === 'drill'
      ? n.parent === view.rootNodeId
      : n.parent === undefined && (view.kind === 'overview' || n.domain === view.domain),
  );
  const memberIds = new Set(members.map((n) => n.id));

  const proxyIds = new Set<string>();
  if (view.kind === 'domain') {
    const topLevel = new Set(doc.nodes.filter((n) => n.parent === undefined).map((n) => n.id));
    for (const e of doc.edges) {
      if (memberIds.has(e.source) && !memberIds.has(e.target) && topLevel.has(e.target))
        proxyIds.add(e.target);
      if (memberIds.has(e.target) && !memberIds.has(e.source) && topLevel.has(e.source))
        proxyIds.add(e.source);
    }
  }
  const shown = [...members, ...doc.nodes.filter((n) => proxyIds.has(n.id))];

  // Nodes without a stored position stack in a column right of the laid-out ones
  // until auto-layout places them.
  const placed = Object.values(view.positions);
  const fallbackX = placed.length ? Math.max(...placed.map((p) => p.x)) + FALLBACK_GAP_X : 0;
  let unplaced = 0;

  const nodes: ArchFlowNode[] = shown.map((n) => ({
    id: n.id,
    type: 'arch',
    position: view.positions[n.id] ?? { x: fallbackX, y: unplaced++ * FALLBACK_GAP_Y },
    data: { node: n, proxy: proxyIds.has(n.id) },
  }));

  const visible = new Set(shown.map((n) => n.id));
  const edges: ArchFlowEdge[] = doc.edges
    .filter((e) => visible.has(e.source) && visible.has(e.target))
    // Proxy-to-proxy links belong to the other domain's tab.
    .filter((e) => memberIds.has(e.source) || memberIds.has(e.target))
    .map((e) => ({ id: e.id, source: e.source, target: e.target, data: { edge: e } }));

  const frames =
    view.kind === 'overview'
      ? (['fullstack', 'ai', 'hardware'] as const)
          .map((domain) => ({
            domain,
            nodeIds: members.filter((n) => n.domain === domain).map((n) => n.id),
          }))
          .filter((f) => f.nodeIds.length > 0)
      : [];

  return { nodes, edges, frames };
}
