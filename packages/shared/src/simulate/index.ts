import { PROTOCOLS, type Catalog } from '../catalog';
import type { ArchDoc, ArchNode } from '../schema';
import type { Finding, Rule } from '../validate/types';

/*
 * Analytical estimates, not a discrete-event simulation: averages only.
 * ponytail: no queueing, jitter or bursts. Utilisation warnings start below
 * 100% to leave room for them; add a DES engine if tail latency matters.
 */

/** Share of a link, node or supply budget above which a warning is raised. */
export const LINK_WARN = 0.7;
export const NODE_WARN = 0.7;
export const POWER_WARN = 0.8;
/** Share of a battery's rated mAh that is usable (cut-off voltage, ageing, cold). */
export const BATTERY_USABLE = 0.8;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export interface LinkLoad {
  edgeId: string;
  demandKbps: number;
  /** Undefined for network links with no set bandwidth: nothing to compare against. */
  capacityKbps?: number;
  utilization?: number;
}

/** Payload bytes × rate against the edge's bandwidth, or its protocol's nominal one. */
export function linkLoads(doc: ArchDoc): LinkLoad[] {
  return doc.edges
    .filter((e) => e.payload)
    .map((e) => {
      const demandKbps = (e.payload!.sizeBytes * e.payload!.ratePerSec * 8) / 1000;
      const capacityKbps = num(e.props.bandwidthKbps) ?? PROTOCOLS[e.protocol].defaultKbps;
      return {
        edgeId: e.id,
        demandKbps,
        capacityKbps,
        utilization: capacityKbps ? demandKbps / capacityKbps : undefined,
      };
    });
}

export interface NodeLoad {
  nodeId: string;
  /** Messages or requests per second arriving over incoming edges. */
  inRps: number;
  capacityRps?: number;
  utilization?: number;
}

/**
 * Traffic into each node that declares a capacity. An edge points from the
 * caller to the callee, so its payload rate lands on the target.
 */
export function nodeLoads(doc: ArchDoc): NodeLoad[] {
  const inRps = new Map<string, number>();
  for (const e of doc.edges)
    if (e.payload) inRps.set(e.target, (inRps.get(e.target) ?? 0) + e.payload.ratePerSec);
  return doc.nodes
    .filter((n) => num(n.props.capacityRps) !== undefined)
    .map((n) => {
      const capacityRps = num(n.props.capacityRps)!;
      const rps = inRps.get(n.id) ?? 0;
      return {
        nodeId: n.id,
        inRps: rps,
        capacityRps,
        utilization: capacityRps ? rps / capacityRps : undefined,
      };
    });
}

export interface PowerBudget {
  sourceId: string;
  loadMa: number;
  maxMa?: number;
  utilization?: number;
  /** Battery sources only: capacity × BATTERY_USABLE / average draw. */
  batteryHours?: number;
}

/**
 * Current drawn from each power source: every consumer reachable through
 * Power edges, counted once. Regulators pass their load upstream, so a
 * USB supply feeding a regulator feeding sensors carries the sensors too.
 */
export function powerBudgets(doc: ArchDoc, catalog: Catalog): PowerBudget[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const feeds = new Map<string, string[]>();
  for (const e of doc.edges)
    if (e.protocol === 'Power') feeds.set(e.source, [...(feeds.get(e.source) ?? []), e.target]);
  const isSource = (n: ArchNode) => catalog.get(n.type)?.protocols.every((p) => p === 'Power');

  const downstream = (id: string, seen: Set<string>): number => {
    let total = 0;
    for (const next of feeds.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      const n = byId.get(next);
      if (!n) continue;
      // Supplies and regulators draw nothing themselves here; their load is what they feed.
      total += (isSource(n) ? 0 : (num(n.props.currentMa) ?? 0)) + downstream(next, seen);
    }
    return total;
  };

  return doc.nodes
    .filter((n) => n.type === 'power' || isSource(n))
    .filter((n) => (feeds.get(n.id)?.length ?? 0) > 0)
    .map((n) => {
      const loadMa = downstream(n.id, new Set([n.id]));
      const maxMa = num(n.props.maxCurrentMa) || undefined;
      const capacityMah = num(n.props.capacityMah);
      return {
        sourceId: n.id,
        loadMa,
        maxMa,
        utilization: maxMa ? loadMa / maxMa : undefined,
        batteryHours:
          capacityMah && loadMa > 0 ? (capacityMah * BATTERY_USABLE) / loadMa : undefined,
      };
    });
}

/**
 * The lowest-latency path between two nodes, summing each node's latencyMs
 * (and an edge's latencyMs where set), following edges in either
 * direction. Dijkstra; the graphs are small.
 */
export function pathLatency(
  doc: ArchDoc,
  from: string,
  to: string,
): { nodeIds: string[]; totalMs: number } | undefined {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const cost = (id: string) => num(byId.get(id)?.props.latencyMs) ?? 0;
  if (!byId.has(from) || !byId.has(to)) return undefined;

  const dist = new Map([[from, cost(from)]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    const current = [...open].reduce((a, b) => (dist.get(a)! <= dist.get(b)! ? a : b));
    open.delete(current);
    if (current === to) break;
    for (const e of doc.edges) {
      const next = e.source === current ? e.target : e.target === current ? e.source : undefined;
      if (!next) continue;
      const d = dist.get(current)! + (num(e.props.latencyMs) ?? 0) + cost(next);
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, current);
        open.add(next);
      }
    }
  }
  if (!dist.has(to)) return undefined;
  const nodeIds = [to];
  while (nodeIds[0] !== from) nodeIds.unshift(prev.get(nodeIds[0]!)!);
  return { nodeIds, totalMs: dist.get(to)! };
}

const pct = (u: number) => Math.round(u * 100);
const round = (v: number) => Math.round(v * 10) / 10;
const levelOf = (u: number | undefined, warn: number) =>
  u === undefined ? undefined : u > 1 ? 'error' : u >= warn ? 'warning' : undefined;

export const linkOverload: Rule = {
  id: 'link-overload',
  category: 'sim',
  check: ({ doc, node }) =>
    linkLoads(doc).flatMap((l): Finding[] => {
      const severity = levelOf(l.utilization, LINK_WARN);
      const e = doc.edges.find((x) => x.id === l.edgeId)!;
      if (!severity) return [];
      return [
        {
          severity,
          nodeIds: [e.source, e.target],
          edgeIds: [e.id],
          params: {
            source: node(e.source)?.label ?? e.source,
            target: node(e.target)?.label ?? e.target,
            protocol: e.protocol,
            demand: round(l.demandKbps),
            capacity: round(l.capacityKbps!),
            pct: pct(l.utilization!),
          },
        },
      ];
    }),
  text: {
    tr: (p) => ({
      message: `“${p.source}” → “${p.target}” ${p.protocol} hattı %${p.pct} dolu (${p.demand} / ${p.capacity} kbps).`,
      hint: 'Mesajı küçült, gönderim sıklığını azalt ya da daha hızlı bir bağlantı seç.',
    }),
    en: (p) => ({
      message: `The ${p.protocol} link “${p.source}” → “${p.target}” runs at ${p.pct}% (${p.demand} / ${p.capacity} kbps).`,
      hint: 'Shrink the message, send less often, or pick a faster link.',
    }),
  },
};

export const nodeOverload: Rule = {
  id: 'node-overload',
  category: 'sim',
  check: ({ doc, node }) =>
    nodeLoads(doc).flatMap((l): Finding[] => {
      const severity = levelOf(l.utilization, NODE_WARN);
      if (!severity) return [];
      return [
        {
          severity,
          nodeIds: [l.nodeId],
          edgeIds: [],
          params: {
            label: node(l.nodeId)?.label ?? l.nodeId,
            rps: round(l.inRps),
            capacity: l.capacityRps!,
            pct: pct(l.utilization!),
          },
        },
      ];
    }),
  text: {
    tr: (p) => ({
      message: `“${p.label}” kapasitesinin %${p.pct} kadarıyla çalışıyor (${p.rps} / ${p.capacity} istek/sn).`,
      hint: 'Kapasiteyi artır, yatay ölçekle ya da önüne önbellek veya kuyruk koy.',
    }),
    en: (p) => ({
      message: `“${p.label}” runs at ${p.pct}% of capacity (${p.rps} / ${p.capacity} req/s).`,
      hint: 'Raise capacity, scale out, or put a cache or queue in front of it.',
    }),
  },
};

export const powerBudget: Rule = {
  id: 'power-budget',
  category: 'sim',
  check: ({ doc, catalog, node }) =>
    powerBudgets(doc, catalog).flatMap((b): Finding[] => {
      const severity = levelOf(b.utilization, POWER_WARN);
      if (!severity) return [];
      return [
        {
          severity,
          nodeIds: [b.sourceId],
          edgeIds: [],
          params: {
            label: node(b.sourceId)?.label ?? b.sourceId,
            load: round(b.loadMa),
            max: b.maxMa!,
            pct: pct(b.utilization!),
          },
        },
      ];
    }),
  text: {
    tr: (p) => ({
      message: `“${p.label}” %${p.pct} yüklü: ${p.load} mA çekiliyor, sınır ${p.max} mA.`,
      hint: 'Daha güçlü bir kaynak kullan, yükü ikinci bir kaynağa böl ya da tüketimi azalt.',
    }),
    en: (p) => ({
      message: `“${p.label}” is at ${p.pct}%: ${p.load} mA drawn against a ${p.max} mA limit.`,
      hint: 'Use a stronger supply, split the load across supplies, or reduce consumption.',
    }),
  },
};

export const SIM_RULES: readonly Rule[] = [linkOverload, nodeOverload, powerBudget];
