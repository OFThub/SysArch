import { parse } from 'yaml';
import type { Catalog } from '../catalog';
import type { ArchEdge, ArchNode, Props } from '../schema';
import { catalogNode, ImportError, protocolTo, type Imported, type ImportNote } from './common';

/** Well-known images, matched against the whole image reference in order. */
const IMAGES: [RegExp, string, Props?][] = [
  [/pgvector/, 'vector_db', { engine: 'pgvector' }],
  [/qdrant/, 'vector_db', { engine: 'Qdrant' }],
  [/weaviate/, 'vector_db', { engine: 'Weaviate' }],
  [/chroma/, 'vector_db', { engine: 'Chroma' }],
  [/postgres|postgis|timescale/, 'database', { engine: 'PostgreSQL' }],
  [/mysql|mariadb/, 'database', { engine: 'MySQL' }],
  [/mongo/, 'database', { engine: 'MongoDB' }],
  [/redis/, 'cache', { engine: 'Redis' }],
  [/valkey/, 'cache', { engine: 'Valkey' }],
  [/memcached/, 'cache', { engine: 'Memcached' }],
  [/mosquitto/, 'queue', { engine: 'Mosquitto' }],
  [/rabbitmq/, 'queue', { engine: 'RabbitMQ' }],
  [/kafka|redpanda/, 'queue', { engine: 'Kafka' }],
  [/nats/, 'queue', { engine: 'NATS' }],
  [/keycloak/, 'auth', { provider: 'Keycloak' }],
  [/nginx|traefik|caddy|haproxy|envoy/, 'gateway', { kind: 'Reverse proxy' }],
  [/ollama|vllm|text-generation-inference|tritonserver|localai/, 'model_serving'],
];
/** A service built from source is the team's own code; its name says which side. */
const FRONTEND_NAME = /web|front|ui|client|site/i;

/** The container side of the first published port: "8080:3000" → 3000. */
function containerPort(ports: unknown): number | undefined {
  const first: unknown = Array.isArray(ports) ? ports[0] : undefined;
  const raw = typeof first === 'object' && first ? (first as { target?: unknown }).target : first;
  const n = Number(
    String(raw ?? '')
      .split('/')[0]!
      .split(':')
      .at(-1),
  );
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined;
}

/**
 * A docker-compose file as design parts: a component per service, typed by
 * its image (or as own code when it is built from source), and a link per
 * depends_on. Services with an image we do not know come in as API services
 * and say so in the notes.
 */
export function fromCompose(text: string, catalog: Catalog): Imported {
  let src: unknown;
  try {
    src = parse(text);
  } catch (e) {
    throw new ImportError('syntax', (e as Error).message);
  }
  const services = (src as { services?: unknown } | null)?.services;
  if (typeof services !== 'object' || services === null || Array.isArray(services))
    throw new ImportError('empty');
  const entries = Object.entries(services as Record<string, unknown>);
  if (!entries.length) throw new ImportError('empty');

  const notes: ImportNote[] = [];
  const nodes = new Map<string, ArchNode>();
  for (const [name, raw] of entries) {
    const s = (raw ?? {}) as { image?: unknown; build?: unknown; ports?: unknown };
    const image = typeof s.image === 'string' ? s.image.toLowerCase() : '';
    const known = IMAGES.find(([re]) => image && re.test(image));
    let type: string;
    let props: Props = {};
    if (known) [, type, props = {}] = known;
    else if (s.build !== undefined) type = FRONTEND_NAME.test(name) ? 'frontend' : 'api';
    else {
      type = 'api';
      notes.push({ code: 'guessed', subject: name });
    }
    const port = type === 'api' ? containerPort(s.ports) : undefined;
    const node = catalogNode(catalog, name, type, name, port ? { ...props, port } : props);
    nodes.set(name, { ...node, deploy: { target: 'docker' } });
  }

  const edges: ArchEdge[] = [];
  for (const [name, raw] of entries) {
    const deps = (raw as { depends_on?: unknown } | null)?.depends_on;
    const names = Array.isArray(deps)
      ? deps.map(String)
      : typeof deps === 'object' && deps
        ? Object.keys(deps)
        : [];
    for (const dep of names) {
      const target = nodes.get(dep);
      if (!target) {
        notes.push({ code: 'skipped', subject: `${name} → ${dep}` });
        continue;
      }
      edges.push({
        id: `${name}-${dep}`,
        source: name,
        target: dep,
        protocol: protocolTo(target),
        props: {},
      });
    }
  }
  return { nodes: [...nodes.values()], edges, notes };
}
