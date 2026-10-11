import type { Catalog } from '../catalog';
import type { ArchEdge, ArchNode, Props } from '../schema';
import {
  catalogNode,
  ImportError,
  protocolTo,
  safeId,
  type Imported,
  type ImportNote,
} from './common';
import { imageType, ownCodeType } from './compose';

/*
 * `terraform show -json` output, of a state or a plan, as design parts.
 * State JSON holds every attribute in the clear, secrets included, so
 * nothing is copied wholesale: a component takes its type, a name, and the
 * few values read below (engine, storage, image). The rest stays behind.
 */

type Values = Record<string, unknown>;
interface Resource {
  address: string;
  mode?: string;
  type: string;
  name: string;
  values?: Values;
  depends_on?: string[];
}
interface Module {
  resources?: Resource[];
  child_modules?: Module[];
}
interface ConfigModule {
  resources?: { address: string; mode?: string; expressions?: unknown; depends_on?: string[] }[];
  module_calls?: Record<string, { module?: ConfigModule }>;
}

/** AWS resources that are components, with what their type alone says. */
const AWS: Record<string, [string, Props?]> = {
  aws_ecs_service: ['api'],
  aws_lambda_function: ['api'],
  aws_instance: ['api'],
  aws_apprunner_service: ['api'],
  aws_db_instance: ['database'],
  aws_rds_cluster: ['database'],
  aws_elasticache_cluster: ['cache'],
  aws_elasticache_replication_group: ['cache'],
  aws_sqs_queue: ['queue', { engine: 'SQS' }],
  aws_msk_cluster: ['queue', { engine: 'Kafka' }],
  aws_mq_broker: ['queue', { engine: 'RabbitMQ' }],
  aws_lb: ['gateway', { kind: 'Load balancer' }],
  aws_alb: ['gateway', { kind: 'Load balancer' }],
  aws_api_gateway_rest_api: ['gateway', { kind: 'API gateway' }],
  aws_apigatewayv2_api: ['gateway', { kind: 'API gateway' }],
  aws_cloudfront_distribution: ['gateway', { kind: 'CDN' }],
  aws_cognito_user_pool: ['auth', { provider: 'Cognito' }],
  aws_s3_bucket: ['dataset'],
  aws_sagemaker_endpoint: ['model_serving'],
};
const ENGINES: [RegExp, string][] = [
  [/postgres/, 'PostgreSQL'],
  [/mysql|maria/, 'MySQL'],
  [/valkey/, 'Valkey'],
  [/redis/, 'Redis'],
  [/memcached/, 'Memcached'],
];
/** What a container is made of; not worth a note when left out. */
const DOCKER_PARTS = new Set(['docker_image', 'docker_network', 'docker_volume']);
/**
 * Resources that tie two components together without either depending on
 * the other: a listener puts services behind a load balancer, an
 * integration puts a function behind an API, a mapping feeds a queue to a
 * consumer.
 */
const JOINS: Record<string, 'gateway' | 'queue'> = {
  aws_lb_listener: 'gateway',
  aws_alb_listener: 'gateway',
  aws_lb_listener_rule: 'gateway',
  aws_api_gateway_integration: 'gateway',
  aws_apigatewayv2_integration: 'gateway',
  aws_lambda_event_source_mapping: 'queue',
};
const TARGET_GROUP = /^aws_(lb|alb)_target_group$/;
/** Names that say nothing; a resource in a module then goes by the module's name. */
const GENERIC = new Set(['this', 'main', 'default', 'primary', 'self']);

/** One component for all count / for_each instances: "a.b[0]" → "a.b". */
const base = (address: string) => address.replace(/\[[^\]]*\]/g, '');
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function flatten(m: Module | undefined, out: Resource[] = []): Resource[] {
  for (const r of m?.resources ?? []) if (r.mode !== 'data') out.push(r);
  for (const c of m?.child_modules ?? []) flatten(c, out);
  return out;
}

/** References inside configuration expressions, at any depth. */
function references(expr: unknown, out: string[] = []): string[] {
  if (Array.isArray(expr)) for (const e of expr) references(e, out);
  else if (expr && typeof expr === 'object')
    for (const [k, v] of Object.entries(expr))
      if (k === 'references' && Array.isArray(v)) out.push(...v.map(String));
      else references(v, out);
  return out;
}

/**
 * Components from the resources (AWS, Docker containers, and any resource
 * a custom type names), links from what each depends on. Resources that are
 * not components carry links through them and are noted by type.
 */
export function fromTerraform(text: string, catalog: Catalog): Imported {
  let src: Values;
  try {
    src = JSON.parse(text) as Values;
  } catch (e) {
    throw new ImportError('syntax', (e as Error).message);
  }
  const values = (src.values ?? src.planned_values) as { root_module?: Module } | undefined;
  if (!src.format_version || !values?.root_module) throw new ImportError('format');

  // Every managed resource by its base address; the first instance stands for all.
  const prior = (src.prior_state as { values?: { root_module?: Module } } | undefined)?.values;
  const listed = [...flatten(values.root_module), ...flatten(prior?.root_module)];
  const all = new Map<string, Resource>();
  for (const r of listed) if (!all.has(base(r.address))) all.set(base(r.address), r);

  // What each depends on: recorded in state, or referenced in the plan's configuration.
  const deps = new Map<string, Set<string>>([...all.keys()].map((b) => [b, new Set<string>()]));
  const resolve = (scope: string, ref: string) => {
    const parts = base(ref).split('.');
    for (let k = parts.length; k >= 2; k--) {
      const b = scope + parts.slice(0, k).join('.');
      if (all.has(b)) return b;
    }
    return undefined;
  };
  const dependsOn = (from: string, to: string | undefined) => {
    if (to && to !== from) deps.get(from)?.add(to);
  };
  for (const r of listed)
    for (const d of r.depends_on ?? []) dependsOn(base(r.address), resolve('', d));
  // The image a container runs, read from the plan, where its id is not known yet.
  const imageRef = new Map<string, string>();
  const walk = (m: ConfigModule | undefined, scope: string) => {
    for (const r of m?.resources ?? []) {
      if (r.mode === 'data') continue;
      const self = scope + r.address;
      for (const ref of [...references(r.expressions), ...(r.depends_on ?? [])])
        dependsOn(self, resolve(scope, ref));
      const image = references((r.expressions as Values | undefined)?.image)
        .map((ref) => resolve(scope, ref))
        .find((b) => b && all.get(b)!.type === 'docker_image');
      if (image) imageRef.set(self, image);
    }
    for (const [name, call] of Object.entries(m?.module_calls ?? {}))
      walk(call.module, `${scope}module.${name}.`);
  };
  walk((src.configuration as { root_module?: ConfigModule } | undefined)?.root_module, '');

  // A custom type that names an AWS resource imports it too.
  const custom = new Map(
    [...catalog.values()].flatMap((t) => {
      const aws = t.exportHints.terraformResource?.aws;
      return aws ? [[aws, t.type] as const] : [];
    }),
  );
  const notes: ImportNote[] = [];
  const nodes = new Map<string, ArchNode>();
  const ids = new Set<string>();
  const skipped = new Map<string, number>();
  for (const [b, r] of all) {
    const v = r.values ?? {};
    let kind: [string, Props?] | undefined = AWS[r.type];
    if (!kind && custom.has(r.type)) kind = [custom.get(r.type)!];
    if (r.type === 'docker_container') {
      const img =
        all.get(imageRef.get(b) ?? '') ??
        [...all.values()].find((x) => x.type === 'docker_image' && x.values?.image_id === v.image);
      const built = Array.isArray(img?.values?.build) && img.values.build.length > 0;
      const known = built ? undefined : imageType(str(img?.values?.name) ?? '');
      if (!known && !built) notes.push({ code: 'guessed', subject: r.name });
      kind = known ?? [built ? ownCodeType(r.name) : 'api'];
    }
    if (!kind) {
      if (!DOCKER_PARTS.has(r.type)) skipped.set(r.type, (skipped.get(r.type) ?? 0) + 1);
      continue;
    }

    const [type, fixed = {}] = kind;
    const props: Props = { ...fixed };
    const engine = ENGINES.find(([re]) => re.test(str(v.engine)?.toLowerCase() ?? ''))?.[1];
    if (engine && (type === 'database' || type === 'cache')) props.engine = engine;
    if (type === 'database' && typeof v.allocated_storage === 'number')
      props.storageGb = v.allocated_storage;

    const module = /(?:^|\.)module\.([^.]+)\.[^.]+\.[^.]+$/.exec(b)?.[1];
    const short = GENERIC.has(r.name) && module ? module : r.name;
    const tag = str((v.tags as Values | undefined)?.Name)?.trim();
    let id = safeId(short);
    for (let i = 2; ids.has(id); i++) id = `${safeId(short).slice(0, 60)}-${i}`;
    ids.add(id);
    const node = catalogNode(catalog, id, type, (tag || short).slice(0, 120), props);
    const target = r.type.startsWith('docker_')
      ? 'docker'
      : r.type.startsWith('aws_')
        ? 'aws'
        : undefined;
    nodes.set(b, target ? { ...node, deploy: { target } } : node);
  }
  if (!nodes.size) throw new ImportError('empty');
  for (const [type, n] of [...skipped].sort(([a], [b]) => (a < b ? -1 : 1)))
    notes.push({ code: 'skipped', subject: n > 1 ? `${type} ×${n}` : type });

  // Components a resource leads to, through anything that is not one. A
  // target group stands for what sits behind it only when asked: a service
  // depends on its target group, but does not call the load balancer.
  const reach = (from: string, behindGroups: boolean): Set<string> => {
    const found = new Set<string>();
    const seen = new Set([from]);
    const stack = [...(deps.get(from) ?? [])];
    while (stack.length) {
      const b = stack.pop()!;
      if (seen.has(b)) continue;
      seen.add(b);
      if (nodes.has(b)) found.add(b);
      else if (TARGET_GROUP.test(all.get(b)!.type)) {
        if (behindGroups) for (const x of behind(b)) found.add(x);
      } else stack.push(...(deps.get(b) ?? []));
    }
    return found;
  };
  // What a target group routes to: services that name it, or what its attachments name.
  const behind = (group: string) => {
    const found = new Set<string>();
    for (const [b, ds] of deps) {
      if (!ds.has(group) || JOINS[all.get(b)!.type]) continue;
      if (nodes.has(b)) found.add(b);
      else for (const x of reach(b, false)) found.add(x);
    }
    return found;
  };

  const edges = new Map<string, ArchEdge>();
  const connect = (from: string, to: string) => {
    const s = nodes.get(from)!;
    const t = nodes.get(to)!;
    const id = `${s.id}-${t.id}`;
    if (s !== t && !edges.has(id))
      edges.set(id, { id, source: s.id, target: t.id, protocol: protocolTo(t), props: {} });
  };
  for (const b of nodes.keys()) for (const to of reach(b, false)) connect(b, to);
  for (const [b, r] of all) {
    const hub = JOINS[r.type];
    if (!hub) continue;
    const ends = [...reach(b, true)];
    for (const h of ends.filter((e) => nodes.get(e)!.type === hub))
      for (const o of ends.filter((e) => nodes.get(e)!.type !== hub))
        // A gateway calls what sits behind it; a consumer reads from its queue.
        if (hub === 'gateway') connect(h, o);
        else connect(o, h);
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()], notes };
}
