import { z } from 'zod';
import { removeElements } from './edit';
import {
  ArchDocSchema,
  BoundarySchema,
  DomainSchema,
  EdgeSchema,
  FlowSchema,
  NodeSchema,
  PayloadSchema,
  PinDefSchema,
  PinMapSchema,
  ProtocolSchema,
  type ArchDoc,
  type ArchEdge,
  type ArchNode,
  type Props,
} from './schema';

const Id = NodeSchema.shape.id;
const Point = z.object({ x: z.number(), y: z.number() });
/** Props patches merge key by key; `null` deletes a key. */
const PropsPatch = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
type PropsPatch = z.infer<typeof PropsPatch>;

// In a patch, a missing field stays as it is and `null` clears an optional one.
const NodePatchSchema = z
  .object({
    type: NodeSchema.shape.type,
    domain: DomainSchema,
    label: NodeSchema.shape.label,
    parent: Id.nullable(),
    props: PropsPatch,
    pins: z.array(PinDefSchema).nullable(),
    deploy: NodeSchema.shape.deploy.unwrap().nullable(),
    notes: NodeSchema.shape.notes.unwrap().nullable(),
  })
  .partial();
export type NodeOpPatch = z.infer<typeof NodePatchSchema>;

const EdgePatchSchema = z
  .object({
    source: Id,
    target: Id,
    protocol: ProtocolSchema,
    pins: z.array(PinMapSchema).nullable(),
    props: PropsPatch,
    payload: PayloadSchema.nullable(),
  })
  .partial();
export type EdgeOpPatch = z.infer<typeof EdgePatchSchema>;

/**
 * One architecture change. AI, MCP, import and diff all speak this: model
 * output is parsed with OpSchema, applied with applyOps and only then shown
 * for approval. Flows and boundaries are small, so they are set whole.
 */
export const OpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    node: NodeSchema,
    /** Where it sits per view; views it is missing from place it on the next layout. */
    positions: z.record(z.string(), Point).optional(),
  }),
  z.object({ op: z.literal('update_node'), id: Id, patch: NodePatchSchema }),
  z.object({ op: z.literal('remove_node'), id: Id }),
  z.object({ op: z.literal('add_edge'), edge: EdgeSchema }),
  z.object({ op: z.literal('update_edge'), id: Id, patch: EdgePatchSchema }),
  z.object({ op: z.literal('remove_edge'), id: Id }),
  z.object({ op: z.literal('set_flow'), flow: FlowSchema }),
  z.object({ op: z.literal('remove_flow'), id: Id }),
  z.object({ op: z.literal('set_boundary'), boundary: BoundarySchema }),
  z.object({ op: z.literal('remove_boundary'), id: Id }),
]);
export type Op = z.infer<typeof OpSchema>;

export interface OpError {
  /** Position of the rejected op in the list. */
  index: number;
  message: string;
}

/**
 * Applies ops in order. Each op either lands whole or is rejected with a
 * reason, and later ops still run against the doc as it stands, so a partial
 * approval that leaves out a dependency reports it instead of failing all.
 * Validity is the schema's own integrity check on the resulting doc: the same
 * rules as a save, not a second copy of them.
 * ponytail: re-parses the whole doc per op, O(ops × doc); fine for AI-sized
 * batches, batch the check if imports ever send thousands of ops.
 */
export function applyOps(doc: ArchDoc, ops: Op[]): { doc: ArchDoc; errors: OpError[] } {
  const errors: OpError[] = [];
  let current = doc;
  ops.forEach((op, index) => {
    const next = step(current, op);
    if (typeof next === 'string') {
      errors.push({ index, message: next });
      return;
    }
    const r = ArchDocSchema.safeParse(next);
    if (!r.success) {
      const message = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      errors.push({ index, message });
      return;
    }
    current = next;
  });
  return { doc: current, errors };
}

const unknown = (what: string, id: string) => `unknown ${what} "${id}"`;
const has = (items: { id: string }[], id: string) => items.some((x) => x.id === id);
const upsert = <T extends { id: string }>(items: T[], item: T) =>
  has(items, item.id) ? items.map((x) => (x.id === item.id ? item : x)) : [...items, item];

function step(doc: ArchDoc, op: Op): ArchDoc | string {
  switch (op.op) {
    case 'add_node': {
      const positions = op.positions ?? {};
      const view = Object.keys(positions).find((v) => !has(doc.views, v));
      if (view !== undefined) return unknown('view', view);
      return {
        ...doc,
        nodes: [...doc.nodes, op.node],
        views: doc.views.map((v) =>
          positions[v.id]
            ? { ...v, positions: { ...v.positions, [op.node.id]: positions[v.id]! } }
            : v,
        ),
      };
    }
    case 'update_node':
      if (!has(doc.nodes, op.id)) return unknown('node', op.id);
      return {
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === op.id ? applyPatch(n, op.patch) : n)),
      };
    case 'remove_node':
      if (!has(doc.nodes, op.id)) return unknown('node', op.id);
      return removeElements(doc, [op.id], []);
    case 'add_edge':
      return { ...doc, edges: [...doc.edges, op.edge] };
    case 'update_edge':
      if (!has(doc.edges, op.id)) return unknown('edge', op.id);
      return {
        ...doc,
        edges: doc.edges.map((e) => (e.id === op.id ? applyPatch(e, op.patch) : e)),
      };
    case 'remove_edge':
      if (!has(doc.edges, op.id)) return unknown('edge', op.id);
      return removeElements(doc, [], [op.id]);
    case 'set_flow':
      return { ...doc, flows: upsert(doc.flows, op.flow) };
    case 'remove_flow':
      if (!has(doc.flows, op.id)) return unknown('flow', op.id);
      return { ...doc, flows: doc.flows.filter((f) => f.id !== op.id) };
    case 'set_boundary':
      return { ...doc, boundaries: upsert(doc.boundaries, op.boundary) };
    case 'remove_boundary':
      if (!has(doc.boundaries, op.id)) return unknown('boundary', op.id);
      return { ...doc, boundaries: doc.boundaries.filter((b) => b.id !== op.id) };
  }
}

function applyPatch<T extends { props: Props }>(item: T, patch: NodeOpPatch | EdgeOpPatch): T {
  const out: Record<string, unknown> = { ...item };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'props') out.props = mergeProps(item.props, value as PropsPatch);
    else if (value === null) delete out[key];
    else out[key] = value;
  }
  return out as T;
}

function mergeProps(props: Props, patch: PropsPatch): Props {
  const out = { ...props };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}

const NODE_FIELDS = ['type', 'domain', 'label', 'parent', 'pins', 'deploy', 'notes'] as const;
const EDGE_FIELDS = ['source', 'target', 'protocol', 'pins', 'payload'] as const;

/**
 * The ops that turn `a` into `b`, so `applyOps(a, diffDocs(a, b))` gives `b`
 * for everything the architecture consists of: nodes, edges, flows and
 * boundaries, plus where added nodes sit.
 * ponytail: moves of existing nodes, meta, views and custom types are not
 * diffed (layout is not architecture); add set_positions when snapshot
 * restore (M6) needs them.
 */
export function diffDocs(a: ArchDoc, b: ArchDoc): Op[] {
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((x) => [x.id, x]));
  const [aNodes, bNodes, aEdges, bEdges] = [
    byId(a.nodes),
    byId(b.nodes),
    byId(a.edges),
    byId(b.edges),
  ];
  const ops: Op[] = [];

  // Edges go before nodes: removing a node takes its edges with it.
  for (const e of a.edges) if (!bEdges.has(e.id)) ops.push({ op: 'remove_edge', id: e.id });
  for (const n of a.nodes) if (!bNodes.has(n.id)) ops.push({ op: 'remove_node', id: n.id });

  // New nodes parents first, so every parent exists when its child arrives.
  const parentOf = new Map(b.nodes.map((n) => [n.id, n.parent]));
  const depth = (id: string) => {
    let d = 0;
    for (let p = parentOf.get(id); p !== undefined; p = parentOf.get(p)) d++;
    return d;
  };
  for (const n of b.nodes
    .filter((n) => !aNodes.has(n.id))
    .sort((x, y) => depth(x.id) - depth(y.id))) {
    const positions = Object.fromEntries(
      b.views.filter((v) => v.positions[n.id]).map((v) => [v.id, v.positions[n.id]!]),
    );
    ops.push({ op: 'add_node', node: n, ...(Object.keys(positions).length && { positions }) });
  }

  // A node that changes parent is detached first and reattached after every
  // other change. Otherwise swapping a parent and its child would pass
  // through a cycle, which the schema rejects.
  const reattach: Op[] = [];
  for (const n of b.nodes) {
    const old = aNodes.get(n.id);
    if (!old) continue;
    const patch: NodeOpPatch = fieldPatch(old, n, NODE_FIELDS);
    if (patch.parent !== undefined && n.parent !== undefined) {
      reattach.push({ op: 'update_node', id: n.id, patch: { parent: n.parent } });
      if (old.parent === undefined) delete patch.parent;
      else patch.parent = null;
    }
    if (Object.keys(patch).length) ops.push({ op: 'update_node', id: n.id, patch });
  }
  ops.push(...reattach);

  for (const e of b.edges) {
    const old = aEdges.get(e.id);
    if (!old) ops.push({ op: 'add_edge', edge: e });
    else {
      const patch: EdgeOpPatch = fieldPatch(old, e, EDGE_FIELDS);
      if (Object.keys(patch).length) ops.push({ op: 'update_edge', id: e.id, patch });
    }
  }

  const aFlows = byId(a.flows);
  for (const f of b.flows) if (!same(aFlows.get(f.id), f)) ops.push({ op: 'set_flow', flow: f });
  for (const f of a.flows)
    if (!b.flows.some((x) => x.id === f.id)) ops.push({ op: 'remove_flow', id: f.id });
  const aBounds = byId(a.boundaries);
  for (const x of b.boundaries)
    if (!same(aBounds.get(x.id), x)) ops.push({ op: 'set_boundary', boundary: x });
  for (const x of a.boundaries)
    if (!b.boundaries.some((y) => y.id === x.id)) ops.push({ op: 'remove_boundary', id: x.id });

  return ops;
}

/** Changed fields of `next` over `old`; cleared fields become null, props diff key by key. */
function fieldPatch<T extends ArchNode | ArchEdge>(
  old: T,
  next: T,
  fields: readonly (keyof T)[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of fields)
    if (!same(old[key], next[key])) patch[key as string] = next[key] ?? null;
  const props: PropsPatch = {};
  for (const key of new Set([...Object.keys(old.props), ...Object.keys(next.props)]))
    if (old.props[key] !== next.props[key]) props[key] = next.props[key] ?? null;
  if (Object.keys(props).length) patch.props = props;
  return patch;
}

/** Structural equality for JSON-shaped values; key order and undefined keys do not count. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = (o: object) =>
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);
  const [ka, kb] = [keys(a), keys(b)];
  return (
    ka.length === kb.length &&
    ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}
