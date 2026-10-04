import { defaultProps, type Catalog } from '../catalog';
import type { Op } from '../ops';
import type { ArchDoc, ArchEdge, ArchNode, Props } from '../schema';

type Point = { x: number; y: number };

/** Something in a source that did not come across exactly as written. */
export interface ImportNote {
  /** guessed: brought in under a type picked by name; skipped: left out. */
  code: 'guessed' | 'skipped';
  /** What it concerns: a service, a part or a line of the source. */
  subject: string;
}

/** A source read as design parts, still under the source's own ids. */
export interface Imported {
  nodes: ArchNode[];
  edges: ArchEdge[];
  /** Placement the source gave, by view id. */
  positions?: Record<string, Record<string, Point>>;
  notes: ImportNote[];
}

/** A source an importer cannot read; `code` picks the message shown. */
export class ImportError extends Error {
  readonly code: 'syntax' | 'empty' | 'format';
  constructor(code: ImportError['code'], detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

/** A node of a built-in type: the type's defaults, then the given props. */
export function catalogNode(
  catalog: Catalog,
  id: string,
  type: string,
  label: string,
  props: Props = {},
): ArchNode {
  const t = catalog.get(type);
  if (!t) throw new Error(`unknown type ${type}`);
  return { id, domain: t.domain, type, label, props: { ...defaultProps(t), ...props } };
}

/** A source name made into a valid id: [A-Za-z0-9_-], at most 64 chars. */
export const safeId = (raw: string) =>
  raw
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'n';

/**
 * The ops that add an import to a doc. Ids are made free in the doc (a clash
 * gets a numeric suffix) and links follow the renames. Nothing already in
 * the doc is matched or changed, so a review reads as "adds these".
 */
export function importOps(doc: ArchDoc, imported: Imported): Op[] {
  const free = (taken: Set<string>, raw: string) => {
    const base = safeId(raw);
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base.slice(0, 60)}-${i}`;
    taken.add(id);
    return id;
  };
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeIds = new Set(doc.edges.map((e) => e.id));
  const views = new Set(doc.views.map((v) => v.id));
  const rename = new Map(imported.nodes.map((n) => [n.id, free(nodeIds, n.id)]));

  const ops: Op[] = imported.nodes.map((n) => {
    const positions = Object.fromEntries(
      Object.entries(imported.positions ?? {}).flatMap(([view, at]) =>
        views.has(view) && at[n.id] ? [[view, at[n.id]!]] : [],
      ),
    );
    return {
      op: 'add_node',
      node: { ...n, id: rename.get(n.id)! },
      ...(Object.keys(positions).length && { positions }),
    };
  });
  for (const e of imported.edges)
    ops.push({
      op: 'add_edge',
      edge: {
        ...e,
        id: free(edgeIds, e.id),
        source: rename.get(e.source)!,
        target: rename.get(e.target)!,
      },
    });
  return ops;
}
