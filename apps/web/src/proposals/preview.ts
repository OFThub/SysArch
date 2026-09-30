import { applyOps, type ArchDoc, type Catalog, type Op, type OpError } from '@sysarch/shared';
import { tr } from '../i18n/tr';

export type DiffMark = 'added' | 'removed' | 'changed';

export interface Preview {
  /**
   * The doc after the ops, plus what they remove, so the canvas can draw
   * removals as ghosts where they stood.
   */
  doc: ArchDoc;
  /** The plain outcome, without ghosts: what validation and descriptions read. */
  after: ArchDoc;
  nodes: Map<string, DiffMark>;
  edges: Map<string, DiffMark>;
  errors: OpError[];
}

/** What the canvas shows while a proposal is open: the outcome, with every change marked. */
export function previewOps(doc: ArchDoc, ops: Op[]): Preview {
  const { doc: after, errors } = applyOps(doc, ops);
  const nodes = marks(doc.nodes, after.nodes);
  const edges = marks(doc.edges, after.edges);

  const goneNodes = new Set([...nodes].filter(([, m]) => m === 'removed').map(([id]) => id));
  const pick = (positions: Record<string, { x: number; y: number }>) =>
    Object.fromEntries(Object.entries(positions).filter(([id]) => goneNodes.has(id)));

  return {
    doc: {
      ...after,
      nodes: [...after.nodes, ...doc.nodes.filter((n) => goneNodes.has(n.id))],
      edges: [...after.edges, ...doc.edges.filter((e) => edges.get(e.id) === 'removed')],
      views: after.views.map((v) => ({
        ...v,
        positions: {
          ...pick(doc.views.find((o) => o.id === v.id)?.positions ?? {}),
          ...v.positions,
        },
      })),
    },
    after,
    nodes,
    edges,
    errors,
  };
}

function marks<T extends { id: string }>(before: T[], after: T[]) {
  const old = new Map(before.map((x) => [x.id, x]));
  const now = new Set(after.map((x) => x.id));
  const out = new Map<string, DiffMark>();
  for (const x of after) {
    const prev = old.get(x.id);
    // applyOps keeps untouched items by reference; compare content only when it made a copy.
    if (!prev) out.set(x.id, 'added');
    else if (prev !== x && JSON.stringify(prev) !== JSON.stringify(x)) out.set(x.id, 'changed');
  }
  for (const x of before) if (!now.has(x.id)) out.set(x.id, 'removed');
  return out;
}

/** One line per op, in the words of the UI. Labels come from the doc before or after the change. */
export function describeOp(op: Op, before: ArchDoc, after: ArchDoc, catalog: Catalog): string {
  const node = (id: string) =>
    before.nodes.find((n) => n.id === id) ?? after.nodes.find((n) => n.id === id);
  const label = (id: string) => node(id)?.label ?? id;
  const edge = (id: string) =>
    before.edges.find((e) => e.id === id) ?? after.edges.find((e) => e.id === id);
  const t = tr.proposals.op;

  switch (op.op) {
    case 'add_node':
      return t.add_node(op.node.label, catalog.get(op.node.type)?.label ?? op.node.type);
    case 'update_node': {
      const n = node(op.id);
      const fieldLabel = (key: string) =>
        catalog
          .get(n?.type ?? '')
          ?.fields.find((f) => f.key === key)
          ?.label.toLocaleLowerCase('tr') ?? key;
      return t.update_node(label(op.id), fieldList(op.patch, fieldLabel));
    }
    case 'remove_node':
      return t.remove_node(label(op.id));
    case 'add_edge':
      return t.add_edge(label(op.edge.source), label(op.edge.target), op.edge.protocol);
    case 'update_edge': {
      const e = edge(op.id);
      return t.update_edge(
        label(e?.source ?? '?'),
        label(e?.target ?? '?'),
        fieldList(op.patch, (k) => k),
      );
    }
    case 'remove_edge': {
      const e = edge(op.id);
      return t.remove_edge(label(e?.source ?? '?'), label(e?.target ?? '?'));
    }
    case 'set_flow':
      return t.set_flow(op.flow.name);
    case 'remove_flow':
      return t.remove_flow(before.flows.find((f) => f.id === op.id)?.name ?? op.id);
    case 'set_boundary':
      return t.set_boundary(op.boundary.name);
    case 'remove_boundary':
      return t.remove_boundary(before.boundaries.find((b) => b.id === op.id)?.name ?? op.id);
  }
}

/** "etiket, port": patch fields in UI words; props show by their catalog label. */
function fieldList(patch: Record<string, unknown>, propLabel: (key: string) => string) {
  const names = Object.keys(patch).flatMap((key) =>
    key === 'props'
      ? Object.keys(patch.props as object).map(propLabel)
      : [tr.proposals.field[key] ?? key],
  );
  return names.join(', ');
}
