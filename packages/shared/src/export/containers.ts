import type { Catalog } from '../catalog';
import type { ArchDoc, ArchNode } from '../schema';

/*
 * The containers a design implies: one per software component that runs in
 * Docker. docker-compose.yml and the Docker Terraform both render this list,
 * so the two never disagree about what runs, from which image, on which
 * ports and with which data.
 */

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Service name, also the hostname other containers reach it by. */
const slug = (id: string) => id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

/** Code the team writes: built from a service folder, not pulled as an image. */
const CUSTOM_CODE = new Set([
  'api',
  'frontend',
  'agent',
  'preprocessing',
  'evaluation',
  'training',
]);

/** Engine choice overrides the type's default image. */
const ENGINE_IMAGES: Record<string, { image: string; ports?: string[]; data?: string }> = {
  PostgreSQL: {
    image: 'postgres:17-alpine',
    ports: ['5432:5432'],
    data: '/var/lib/postgresql/data',
  },
  MySQL: { image: 'mysql:8.4', ports: ['3306:3306'], data: '/var/lib/mysql' },
  MongoDB: { image: 'mongo:8', ports: ['27017:27017'], data: '/data/db' },
  Redis: { image: 'redis:7-alpine', ports: ['6379:6379'], data: '/data' },
  Valkey: { image: 'valkey/valkey:8-alpine', ports: ['6379:6379'], data: '/data' },
  Memcached: { image: 'memcached:1.6-alpine', ports: ['11211:11211'] },
  RabbitMQ: {
    image: 'rabbitmq:4-management-alpine',
    ports: ['5672:5672', '15672:15672'],
    data: '/var/lib/rabbitmq',
  },
  Mosquitto: { image: 'eclipse-mosquitto:2', ports: ['1883:1883'], data: '/mosquitto/data' },
  NATS: { image: 'nats:2', ports: ['4222:4222'] },
  Qdrant: { image: 'qdrant/qdrant', ports: ['6333:6333'], data: '/qdrant/storage' },
};

/** Passwords an engine refuses to start without; supplied at run time, never written. */
const ENGINE_SECRETS: Record<string, string> = {
  PostgreSQL: 'POSTGRES_PASSWORD',
  MySQL: 'MYSQL_ROOT_PASSWORD',
};

/** Generated files a container reads, as [path in the export, path in the container]. */
const ENGINE_FILES: Record<string, [string, string][]> = {
  Mosquitto: [['mosquitto/mosquitto.conf', '/mosquitto/config/mosquitto.conf']],
};

export interface Container {
  node: ArchNode;
  name: string;
  /** Folder in the export with the team's code; set instead of `image`. */
  build?: string;
  image?: string;
  /** Compose short syntax: "host:container". */
  ports: string[];
  /** Environment variables that must be supplied. */
  secrets: string[];
  /** Data directory, kept in a named volume. */
  data?: string;
  /** Generated files mounted read-only. */
  files: [string, string][];
  /** Services this one calls, so they start first. */
  dependsOn: string[];
}

const runsInDocker = (n: ArchNode, catalog: Catalog) =>
  n.domain !== 'hardware' &&
  (n.deploy === undefined || n.deploy.target === 'docker') &&
  !!(
    CUSTOM_CODE.has(n.type) ||
    ENGINE_IMAGES[String(n.props.engine)] ||
    catalog.get(n.type)?.exportHints.dockerImage
  );

export function containers(doc: ArchDoc, catalog: Catalog): Container[] {
  const nodes = doc.nodes.filter((n) => runsInDocker(n, catalog)).sort(byId);
  const names = new Map(nodes.map((n) => [n.id, slug(n.id)]));
  return nodes.map((n) => {
    const name = names.get(n.id)!;
    const engineName = String(n.props.engine);
    const engine = ENGINE_IMAGES[engineName];
    const secret = ENGINE_SECRETS[engineName];
    const hints = catalog.get(n.type)?.exportHints;
    return {
      node: n,
      name,
      ...(CUSTOM_CODE.has(n.type)
        ? { build: `services/${name}` }
        : { image: engine?.image ?? hints?.dockerImage }),
      ports: engine?.ports ?? hints?.composePorts ?? [],
      secrets: secret ? [secret] : [],
      ...(engine?.data && { data: engine.data }),
      files: ENGINE_FILES[engineName] ?? [],
      dependsOn: [
        ...new Set(doc.edges.filter((e) => e.source === n.id).map((e) => names.get(e.target))),
      ]
        .filter((d): d is string => !!d && d !== name)
        .sort(),
    };
  });
}
