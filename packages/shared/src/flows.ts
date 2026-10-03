import type { ArchDoc, Flow } from './schema';

export interface FlowTrace {
  /** Components in the order the flow visits them. */
  nodeIds: string[];
  /** Every visited component's latencyMs plus every link's, as in pathLatency. */
  totalMs: number;
  /** Index of the first step that does not continue where the previous one ended. */
  brokenAt?: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Walks a flow step by step. A step may be travelled either way (a reply
 * goes back over the link it came on), but it has to touch the component
 * the previous step ended at.
 */
export function flowTrace(doc: ArchDoc, flow: Flow): FlowTrace {
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const edges = new Map(doc.edges.map((e) => [e.id, e]));
  const cost = (id: string) => num(nodes.get(id)?.props.latencyMs);

  const first = edges.get(flow.steps[0] ?? '');
  if (!first) return { nodeIds: [], totalMs: 0, ...(flow.steps.length && { brokenAt: 0 }) };
  // Start at the end of the first link that the second one does not share.
  const second = edges.get(flow.steps[1] ?? '');
  const sharesSource = second && [second.source, second.target].includes(first.source);
  const start = sharesSource ? first.target : first.source;

  const nodeIds = [start];
  let totalMs = cost(start);
  let at = start;
  for (const [i, id] of flow.steps.entries()) {
    const e = edges.get(id);
    const next = e?.source === at ? e.target : e?.target === at ? e.source : undefined;
    if (!e || next === undefined) return { nodeIds, totalMs, brokenAt: i };
    totalMs += num(e.props.latencyMs) + cost(next);
    nodeIds.push(next);
    at = next;
  }
  return { nodeIds, totalMs };
}

/**
 * Orders links into one walk when they form a single path, so a flow can be
 * made from a plain selection. Starts at the end whose link points away
 * from it, the way data usually flows. null when the links branch, loop or
 * fall apart.
 */
export function chainEdges(doc: ArchDoc, edgeIds: string[]): string[] | null {
  const chosen = doc.edges.filter((e) => edgeIds.includes(e.id));
  if (chosen.length === 0 || chosen.length !== new Set(edgeIds).size) return null;
  const degree = new Map<string, number>();
  for (const e of chosen)
    for (const n of [e.source, e.target]) degree.set(n, (degree.get(n) ?? 0) + 1);
  if ([...degree.values()].some((d) => d > 2)) return null;
  const ends = [...degree].filter(([, d]) => d === 1).map(([n]) => n);
  if (ends.length !== 2) return null;

  const start = ends.find((n) => chosen.some((e) => e.source === n)) ?? ends[0]!;
  const order: string[] = [];
  const left = new Set(chosen);
  for (let at = start; left.size;) {
    const e = [...left].find((x) => x.source === at || x.target === at);
    if (!e) return null;
    left.delete(e);
    order.push(e.id);
    at = e.source === at ? e.target : e.source;
  }
  return order;
}
