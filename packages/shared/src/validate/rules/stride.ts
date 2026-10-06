import type { ArchDoc, Boundary } from '../../schema';
import type { Rule, RuleContext } from '../types';

/*
 * STRIDE checks over trust boundaries. A boundary names a zone and how far
 * it is trusted; a link that leaves one zone for a differently trusted one
 * is where spoofing, tampering and disclosure happen, so that is where these
 * rules look. Nodes outside every boundary are not judged by zone.
 */

const RANK: Record<Boundary['trust'], number> = { internet: 0, dmz: 1, device: 1, internal: 2 };
/** Links that carry data in the clear unless they say they are encrypted. */
const NETWORK = new Set(['HTTP', 'gRPC', 'WebSocket', 'MQTT', 'SQL', 'AMQP', 'TCP']);

/** The zone each node sits in: its first boundary. */
function zones(doc: ArchDoc) {
  const zone = new Map<string, Boundary>();
  for (const b of doc.boundaries) for (const id of b.nodeIds) if (!zone.has(id)) zone.set(id, b);
  return zone;
}

const strideOf = (ctx: RuleContext, id: string) =>
  ctx.catalog.get(ctx.node(id)?.type ?? '')?.exportHints.strideCategory;

/** Data crossing into a differently trusted zone over a link that is not encrypted. */
export const unencryptedCrossing: Rule = {
  id: 'unencrypted-crossing',
  category: 'security',
  check: (ctx) => {
    const zone = zones(ctx.doc);
    return ctx.doc.edges.flatMap((e) => {
      const a = zone.get(e.source);
      const b = zone.get(e.target);
      if (!a || !b || RANK[a.trust] === RANK[b.trust]) return [];
      if (!NETWORK.has(e.protocol) || e.props.encrypted === true) return [];
      return [
        {
          severity: 'warning',
          nodeIds: [e.source, e.target],
          edgeIds: [e.id],
          params: {
            source: ctx.node(e.source)!.label,
            target: ctx.node(e.target)!.label,
            protocol: e.protocol,
            from: a.name,
            to: b.name,
          },
        },
      ];
    });
  },
  text: {
    tr: (p) => ({
      message: `${p.source} → ${p.target} (${p.protocol}) “${p.from}” ile “${p.to}” arasında şifresiz geçiyor.`,
      hint: 'Bağlantıyı TLS ile şifrele ve “Şifreli” olarak işaretle; aradaki biri veriyi okuyabilir ya da değiştirebilir.',
    }),
    en: (p) => ({
      message: `${p.source} → ${p.target} (${p.protocol}) crosses from “${p.from}” to “${p.to}” unencrypted.`,
      hint: 'Encrypt the link with TLS and mark it encrypted; anyone in between can read or alter the data.',
    }),
  },
};

/** An API open to the internet that asks no one who they are. */
export const publicApiNoAuth: Rule = {
  id: 'public-api-no-auth',
  category: 'security',
  check: ({ doc }) =>
    doc.nodes
      .filter((n) => n.props.public === true && n.props.requiresAuth === false)
      .map((n) => ({
        severity: 'warning',
        nodeIds: [n.id],
        edgeIds: [],
        params: { label: n.label },
      })),
  text: {
    tr: (p) => ({
      message: `${p.label} internete açık ve kimlik doğrulama istemiyor.`,
      hint: 'Kimlik doğrulamayı aç ya da servisi iç ağa al; herkes her isteği atabilir.',
    }),
    en: (p) => ({
      message: `${p.label} is open to the internet and asks for no authentication.`,
      hint: 'Turn authentication on or move the service inside; anyone can send any request.',
    }),
  },
};

/** A data store in the internet zone, or wired straight to something there. */
export const storeExposed: Rule = {
  id: 'store-exposed',
  category: 'security',
  check: (ctx) => {
    const zone = zones(ctx.doc);
    const exposed = (id: string) => zone.get(id)?.trust === 'internet';
    return ctx.doc.nodes.flatMap((n) => {
      if (strideOf(ctx, n.id) !== 'store') return [];
      const via = ctx.edgesOf(n.id).filter((e) => exposed(e.source === n.id ? e.target : e.source));
      if (!exposed(n.id) && !via.length) return [];
      return [
        {
          severity: 'warning',
          nodeIds: [n.id],
          edgeIds: via.map((e) => e.id),
          params: { label: n.label },
        },
      ];
    });
  },
  text: {
    tr: (p) => ({
      message: `${p.label} internet bölgesinden doğrudan erişilebilir.`,
      hint: 'Veri deposunu iç bölgeye al ve önüne bir API koy; sorgular kimlik ve yetki denetiminden geçsin.',
    }),
    en: (p) => ({
      message: `${p.label} is reachable straight from the internet zone.`,
      hint: 'Keep the store in an internal zone behind an API, so queries pass authentication and authorization.',
    }),
  },
};

/** Personal data handed straight to an outside service or model. */
export const piiToExternal: Rule = {
  id: 'pii-to-external',
  category: 'security',
  check: (ctx) =>
    ctx.doc.nodes.flatMap((n) => {
      if (n.props.containsPii !== true) return [];
      return ctx.edgesOf(n.id).flatMap((e) => {
        const other = ctx.node(e.source === n.id ? e.target : e.source)!;
        if (other.domain === 'hardware' || strideOf(ctx, other.id) !== 'external') return [];
        return [
          {
            severity: 'warning',
            nodeIds: [n.id, other.id],
            edgeIds: [e.id],
            params: { data: n.label, service: other.label },
          },
        ];
      });
    }),
  text: {
    tr: (p) => ({
      message: `${p.data} kişisel veri içeriyor ve doğrudan ${p.service} ile paylaşılıyor.`,
      hint: 'Kişisel alanları göndermeden önce maskele ya da çıkar; dış servisin veriyi nasıl sakladığını sözleşmeyle güvenceye al.',
    }),
    en: (p) => ({
      message: `${p.data} holds personal data and goes straight to ${p.service}.`,
      hint: 'Mask or drop personal fields before sending, and secure how the outside service keeps the data by contract.',
    }),
  },
};

export const STRIDE_RULES: readonly Rule[] = [
  unencryptedCrossing,
  publicApiNoAuth,
  storeExposed,
  piiToExternal,
];
