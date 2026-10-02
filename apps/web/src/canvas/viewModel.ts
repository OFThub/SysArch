import {
  type Severity,
  PROTOCOLS,
  type ArchDoc,
  type ArchEdge,
  type ArchNode,
  type Domain,
  type PinRole,
} from '@sysarch/shared';
import type { Edge, Node } from '@xyflow/react';
import type { DiffMark } from '../proposals/preview';

/** A labelled connection point on a node: a pin name for hardware, a protocol otherwise. */
export interface Pad {
  id: string;
  label: string;
}

/** Worst finding on an element, attached by the canvas for its badge. */
export type CanvasIssue = { severity: Severity; count: number; text: string };

export type ArchNodeData = {
  node: ArchNode;
  proxy: boolean;
  pads: { in: Pad[]; out: Pad[] };
  issue?: CanvasIssue;
  /** Set while a proposal is previewed: what it would do to this node. */
  diff?: DiffMark;
};
export type ArchFlowNode = Node<ArchNodeData, 'arch'>;
export type FrameData = { domain: Domain };
export type FrameFlowNode = Node<FrameData, 'frame'>;
export type WireData = {
  edge: ArchEdge;
  /** Set when this line draws one pin mapping of a multi-wire edge. */
  role?: PinRole;
  channel: Domain;
  wireless: boolean;
  power: boolean;
  /**
   * Signed lane among the lines leaving the same node (…, -1, 0, 1, …). The
   * renderer shifts each line's vertical run by it so bundles stay separable.
   */
  lane: number;
  issue?: CanvasIssue;
  diff?: DiffMark;
};
export type ArchFlowEdge = Edge<WireData, 'wire'>;

export interface FlowModel {
  nodes: ArchFlowNode[];
  edges: ArchFlowEdge[];
  /** Overview only: which nodes each domain frame encloses. */
  frames: { domain: Domain; nodeIds: string[] }[];
}

const FALLBACK_GAP_X = 320;
const FALLBACK_GAP_Y = 140;
const WIRELESS_TRANSPORTS = new Set(['wifi', 'ble', 'lora', 'lte', 'zigbee']);

/** Handle ids: `in:`/`out:` plus a pin name or protocol. */
export const padId = (side: 'in' | 'out', name: string) => `${side}:${name}`;
/** React Flow edge ids of pin lines are `<archEdgeId>/<role>`; this recovers the arch id. */
export const archEdgeId = (flowEdgeId: string) => flowEdgeId.split('/')[0]!;

/**
 * Derives what one view shows from the doc. Pure: React Flow state is always
 * rebuilt from the store, never kept as a second source of truth.
 *
 * - domain view: that domain's top-level nodes, plus cross-domain neighbours
 *   as faded proxies so interfaces stay visible;
 * - overview: every top-level node, framed by domain;
 * - drill: the children of the view's root node.
 *
 * Edges with pin mappings become one line per pin (SDA and SCL run side by
 * side between labelled pads); other edges connect protocol pads.
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
  const byId = new Map(shown.map((n) => [n.id, n]));

  const archEdges = doc.edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    // Proxy-to-proxy links belong to the other domain's tab.
    .filter((e) => memberIds.has(e.source) || memberIds.has(e.target));

  const pads = new Map(
    shown.map((n) => [n.id, { in: new Map<string, Pad>(), out: new Map<string, Pad>() }]),
  );
  const addPad = (nodeId: string, side: 'in' | 'out', name: string) => {
    const id = padId(side, name);
    pads.get(nodeId)![side].set(id, { id, label: name });
    return id;
  };

  const edges: ArchFlowEdge[] = archEdges.flatMap((e) => {
    const data = {
      edge: e,
      channel: byId.get(e.source)!.domain,
      wireless:
        PROTOCOLS[e.protocol].wireless ||
        WIRELESS_TRANSPORTS.has(String(e.props.transport ?? '').toLowerCase()),
      power: e.protocol === 'Power',
      lane: 0,
    };
    if (e.pins?.length) {
      return e.pins.map((m) => ({
        id: `${e.id}/${m.role}`,
        type: 'wire' as const,
        source: e.source,
        target: e.target,
        sourceHandle: addPad(e.source, 'out', m.sourcePin),
        targetHandle: addPad(e.target, 'in', m.targetPin),
        data: { ...data, role: m.role },
      }));
    }
    return [
      {
        id: e.id,
        type: 'wire' as const,
        source: e.source,
        target: e.target,
        sourceHandle: addPad(e.source, 'out', e.protocol),
        targetHandle: addPad(e.target, 'in', e.protocol),
        data,
      },
    ];
  });

  // Centre the lanes of each source node around 0.
  const fanOut = new Map<string, ArchFlowEdge[]>();
  for (const e of edges) fanOut.set(e.source, [...(fanOut.get(e.source) ?? []), e]);
  for (const group of fanOut.values())
    group.forEach((e, i) => (e.data = { ...e.data!, lane: i - (group.length - 1) / 2 }));

  // Nodes without a stored position stack in a column right of the laid-out ones
  // until auto-layout places them.
  const placed = Object.values(view.positions);
  const fallbackX = placed.length ? Math.max(...placed.map((p) => p.x)) + FALLBACK_GAP_X : 0;
  let unplaced = 0;

  const nodes: ArchFlowNode[] = shown.map((n) => ({
    id: n.id,
    type: 'arch',
    position: view.positions[n.id] ?? { x: fallbackX, y: unplaced++ * FALLBACK_GAP_Y },
    data: {
      node: n,
      proxy: proxyIds.has(n.id),
      pads: {
        in: orderPads(n, [...pads.get(n.id)!.in.values()]),
        out: orderPads(n, [...pads.get(n.id)!.out.values()]),
      },
    },
  }));

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

/** Pins keep their header order (as on the physical part); protocols sort by name. */
function orderPads(node: ArchNode, pads: Pad[]): Pad[] {
  const pinIndex = new Map((node.pins ?? []).map((p, i) => [p.name, i]));
  const rank = (p: Pad) => pinIndex.get(p.label) ?? Number.MAX_SAFE_INTEGER;
  return pads.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}
