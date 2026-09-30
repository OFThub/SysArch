import { z } from 'zod';
import { newId } from './id';
import {
  CatalogTypeSchema,
  EdgeSchema,
  NodeSchema,
  type ArchDoc,
  type ArchNode,
  type CatalogType,
} from './schema';

type Point = { x: number; y: number };

/**
 * Removes nodes and edges and everything that pointed at them: edges touching
 * a removed node, positions in every view, drill views rooted at it, flow
 * steps and boundary memberships. Children of a removed node move up to the
 * nearest surviving ancestor instead of disappearing with it.
 */
export function removeElements(doc: ArchDoc, nodeIds: string[], edgeIds: string[]): ArchDoc {
  const goneNodes = new Set(nodeIds);
  const goneEdges = new Set(edgeIds);
  for (const e of doc.edges)
    if (goneNodes.has(e.source) || goneNodes.has(e.target)) goneEdges.add(e.id);

  const parentOf = new Map(doc.nodes.map((n) => [n.id, n.parent]));
  const survivingAncestor = (id: string | undefined) => {
    while (id !== undefined && goneNodes.has(id)) id = parentOf.get(id);
    return id;
  };
  const reparent = (n: ArchNode): ArchNode => {
    if (n.parent === undefined || !goneNodes.has(n.parent)) return n;
    const { parent: _, ...rest } = n;
    const parent = survivingAncestor(n.parent);
    return parent === undefined ? rest : { ...rest, parent };
  };

  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !goneNodes.has(n.id)).map(reparent),
    edges: doc.edges.filter((e) => !goneEdges.has(e.id)),
    views: doc.views
      .filter((v) => v.rootNodeId === undefined || !goneNodes.has(v.rootNodeId))
      .map((v) => ({
        ...v,
        positions: Object.fromEntries(
          Object.entries(v.positions).filter(([id]) => !goneNodes.has(id)),
        ),
      })),
    flows: doc.flows.map((f) => ({ ...f, steps: f.steps.filter((s) => !goneEdges.has(s)) })),
    boundaries: doc.boundaries.map((b) => ({
      ...b,
      nodeIds: b.nodeIds.filter((id) => !goneNodes.has(id)),
    })),
  };
}

/** What goes on the clipboard: a self-contained subgraph, validated again on paste. */
export const ClipSchema = z.object({
  kind: z.literal('sysarch/clip'),
  nodes: z.array(NodeSchema).max(1000),
  edges: z.array(EdgeSchema).max(5000),
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
  customTypes: z.array(CatalogTypeSchema).default([]),
});
export type Clip = z.infer<typeof ClipSchema>;

/** Copies nodes, the edges between them, their positions in a view and any custom types they use. */
export function copySubgraph(doc: ArchDoc, nodeIds: string[], viewId: string): Clip {
  const ids = new Set(nodeIds);
  const nodes = doc.nodes
    .filter((n) => ids.has(n.id))
    // A parent left behind would dangle in the pasted copy.
    .map((n) => {
      if (n.parent === undefined || ids.has(n.parent)) return n;
      const { parent: _, ...rest } = n;
      return rest;
    });
  const positions = doc.views.find((v) => v.id === viewId)?.positions ?? {};
  const usedTypes = new Set(nodes.map((n) => n.type));
  return {
    kind: 'sysarch/clip',
    nodes,
    edges: doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    positions: Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id))),
    customTypes: doc.customTypes.filter((t) => usedTypes.has(t.type)),
  };
}

/**
 * Pastes a clip with fresh ids, shifted by `offset` in the given view. Custom
 * types the doc lacks come along; ones it already has are kept as they are.
 */
export function pasteSubgraph(
  doc: ArchDoc,
  clip: Clip,
  viewId: string,
  offset: Point,
): { doc: ArchDoc; nodeIds: string[]; edgeIds: string[] } {
  const idMap = new Map(clip.nodes.map((n) => [n.id, newId()]));
  const nodes = clip.nodes.map((n) => ({
    ...n,
    id: idMap.get(n.id)!,
    ...(n.parent !== undefined && { parent: idMap.get(n.parent) }),
  }));
  const edges = clip.edges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({
      ...e,
      id: newId(),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));

  const placed: Record<string, Point> = {};
  clip.nodes.forEach((n, i) => {
    const p = clip.positions[n.id] ?? { x: i * 40, y: i * 40 };
    placed[idMap.get(n.id)!] = { x: p.x + offset.x, y: p.y + offset.y };
  });

  const known = new Set(doc.customTypes.map((t) => t.type));
  const newTypes: CatalogType[] = clip.customTypes.filter((t) => !known.has(t.type));

  return {
    doc: {
      ...doc,
      nodes: [...doc.nodes, ...nodes],
      edges: [...doc.edges, ...edges],
      views: doc.views.map((v) =>
        v.id === viewId ? { ...v, positions: { ...v.positions, ...placed } } : v,
      ),
      customTypes: [...doc.customTypes, ...newTypes],
    },
    nodeIds: nodes.map((n) => n.id),
    edgeIds: edges.map((e) => e.id),
  };
}
