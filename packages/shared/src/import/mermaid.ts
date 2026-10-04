import type { Catalog } from '../catalog';
import { ProtocolSchema, type ArchEdge, type ArchNode, type Props } from '../schema';
import { catalogNode, ImportError, protocolTo, type Imported, type ImportNote } from './common';

/** Types guessed from a node's text; the first match wins, so specific comes first. */
const KEYWORDS: [RegExp, string, Props?][] = [
  [/vector|qdrant|pinecone|chroma|weaviate|pgvector/i, 'vector_db'],
  [/postgres/i, 'database', { engine: 'PostgreSQL' }],
  [/database|\bdb\b|veritaban|mysql|mongo|sql/i, 'database'],
  [/redis/i, 'cache', { engine: 'Redis' }],
  [/cache|önbellek|memcache/i, 'cache'],
  [/mqtt|mosquitto/i, 'queue', { engine: 'Mosquitto' }],
  [/kafka/i, 'queue', { engine: 'Kafka' }],
  [/queue|rabbit|broker|kuyruk|nats/i, 'queue'],
  [/llm|gpt|claude|openai|anthropic|gemini/i, 'llm_api'],
  [/model|inference|serving/i, 'model_serving'],
  [/auth|login|keycloak|kimlik|oauth/i, 'auth'],
  [/gateway|nginx|proxy|cdn|load.?balancer|ağ geçidi/i, 'gateway'],
  [/agent|ajan/i, 'agent'],
  [/dataset|data.?lake|veri seti/i, 'dataset'],
  [/train|eğitim/i, 'training'],
  [/esp32|arduino|stm32|\bmcu\b|microcontroller|mikrodenetleyici/i, 'mcu'],
  [/raspberry|jetson|\bsbc\b/i, 'sbc'],
  [/sensor|sensör/i, 'sensor'],
  [/\bapi\b|service|server|backend|servis|sunucu/i, 'api'],
  [/web|frontend|\bui\b|client|browser|\bapp\b|panel|mobil/i, 'frontend'],
];

/** A node id and its optional shape; the brackets say what shape it is. */
const NODE =
  /^([\p{L}\p{N}_]+)\s*(\[\[.*?\]\]|\[\(.*?\)\]|\(\[.*?\]\)|\(\(.*?\)\)|\{\{.*?\}\}|\[.*?\]|\(.*?\)|\{.*?\}|>.*?\])?/u;
/** A link and its optional |text|: -->, ---, ==>, -.->, <-->, --o, --x. */
const LINK = /^(<?(?:-{2,}|={2,}|-\.+-?|~{3})[>ox]?)\s*(?:\|([^|]*)\|)?\s*/;
/** Statements that style or group the chart rather than state parts. */
const IGNORED =
  /^(subgraph|end\b|direction|classDef|class\b|style|linkStyle|click|accTitle|accDescr)/;

function shapeLabel(shape: string) {
  return shape
    .replace(/^(\[\[|\[\(|\(\[|\(\(|\{\{|\[|\(|\{|>)/, '')
    .replace(/(\]\]|\)\]|\]\)|\)\)|\}\}|\]|\)|\})$/, '')
    .replace(/^"(.*)"$/, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .trim();
}

interface Statement {
  groups: { id: string; shape?: string }[][];
  links: (string | undefined)[];
}

/** One statement as node groups (A & B) joined by links, or null when it is not one. */
function statement(s: string): Statement | null {
  const groups: Statement['groups'] = [];
  const links: Statement['links'] = [];
  let rest = s;
  for (;;) {
    const group: Statement['groups'][number] = [];
    for (;;) {
      const m = NODE.exec(rest);
      if (!m) return null;
      group.push({ id: m[1]!, shape: m[2] });
      rest = rest
        .slice(m[0].length)
        .replace(/^:::[\w-]+/, '')
        .trimStart();
      if (!rest.startsWith('&')) break;
      rest = rest.slice(1).trimStart();
    }
    groups.push(group);
    if (!rest) return { groups, links };
    const l = LINK.exec(rest);
    if (!l) return null;
    links.push(l[2]?.trim());
    rest = rest.slice(l[0].length);
  }
}

/**
 * A Mermaid flowchart as design parts. Each node's type is guessed from its
 * text (a cylinder is a database); a link's text names its protocol when it
 * says one (SQL, MQTT, gRPC), else the target decides. Styling, subgraphs
 * and comments are skipped quietly; statements that are not understood, and
 * nodes whose type had to fall back to API, are reported as notes.
 */
export function fromMermaid(text: string, catalog: Catalog): Imported {
  const lines = text
    .split(/[\n;]/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  if (!lines.length) throw new ImportError('empty');
  if (!/^(flowchart|graph)\b/i.test(lines[0]!)) throw new ImportError('format');

  const notes: ImportNote[] = [];
  const shapes = new Map<string, string | undefined>();
  const pairs: { source: string; target: string; text?: string }[] = [];
  for (const line of lines.slice(1)) {
    if (IGNORED.test(line)) continue;
    // "A -- text --> B" is "A -->|text| B" spelled differently.
    const s = statement(
      line.replace(
        /(--|==|-\.)\s+([^->=.|][^>|]*?)\s+(-->|==>|\.->|---)/g,
        (_, _open, t: string, arrow: string) => `${arrow}|${t}|`,
      ),
    );
    if (!s) {
      notes.push({ code: 'skipped', subject: line.slice(0, 80) });
      continue;
    }
    for (const n of s.groups.flat())
      if (!shapes.has(n.id) || (n.shape && !shapes.get(n.id))) shapes.set(n.id, n.shape);
    s.links.forEach((t, i) => {
      for (const a of s.groups[i]!)
        for (const b of s.groups[i + 1]!) pairs.push({ source: a.id, target: b.id, text: t });
    });
  }
  if (!shapes.size) throw new ImportError('empty');

  const nodes = new Map<string, ArchNode>();
  for (const [id, shape] of shapes) {
    const label = (shape && shapeLabel(shape)) || id;
    const known: { type: string; props?: Props } | undefined = shape?.startsWith('[(')
      ? { type: 'database' }
      : KEYWORDS.map(([re, type, props]) => ({ re, type, props })).find((k) =>
          k.re.test(`${label} ${id}`),
        );
    if (!known) notes.push({ code: 'guessed', subject: label });
    const { type, props } = known ?? { type: 'api' };
    nodes.set(id, catalogNode(catalog, id, type, label.slice(0, 120), props));
  }

  const edges: ArchEdge[] = pairs.map((p) => ({
    id: `${p.source}-${p.target}`,
    source: p.source,
    target: p.target,
    protocol:
      ProtocolSchema.options.find((x) => p.text && new RegExp(`\\b${x}\\b`, 'i').test(p.text)) ??
      protocolTo(nodes.get(p.target)!),
    props: {},
  }));
  return { nodes: [...nodes.values()], edges, notes };
}
