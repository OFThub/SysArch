import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'id must be 1-64 chars of [A-Za-z0-9_-]');

export const DomainSchema = z.enum(['fullstack', 'ai', 'hardware']);
export type Domain = z.infer<typeof DomainSchema>;
export const DOMAINS = DomainSchema.options;

export const ProtocolSchema = z.enum([
  'HTTP',
  'gRPC',
  'WebSocket',
  'MQTT',
  'SQL',
  'AMQP',
  'TCP',
  'I2C',
  'SPI',
  'UART',
  'CAN',
  'GPIO',
  'PWM',
  'USB',
  'BLE',
  'LoRa',
  'Power',
]);
export type Protocol = z.infer<typeof ProtocolSchema>;

export const PinRoleSchema = z.enum([
  'SDA',
  'SCL',
  'MOSI',
  'MISO',
  'SCK',
  'CS',
  'TX',
  'RX',
  'CANH',
  'CANL',
  'GPIO',
  'PWM',
  'VCC',
  'GND',
]);
export type PinRole = z.infer<typeof PinRoleSchema>;

const PropValue = z.union([z.string(), z.number(), z.boolean()]);
const Props = z.record(z.string(), PropValue);
export type Props = z.infer<typeof Props>;

/** A physical pin: `functions` lists what it can do, e.g. ['GPIO', 'I2C0_SDA']. */
export const PinDefSchema = z.object({
  name: z.string().min(1),
  voltage: z.number().nonnegative(),
  functions: z.array(z.string()),
});
export type PinDef = z.infer<typeof PinDefSchema>;

export const FieldDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['text', 'number', 'select', 'bool', 'markdown']),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
  default: PropValue.optional(),
});
export type FieldDef = z.infer<typeof FieldDefSchema>;

/** Single mapping point for exporters, importers, pricing and STRIDE. */
export const ExportHintsSchema = z.object({
  dockerImage: z.string().optional(),
  composePorts: z.array(z.string()).optional(),
  wokwiType: z.string().optional(),
  terraformResource: z.object({ aws: z.string().optional() }).optional(),
  pricingKey: z.string().optional(),
  strideCategory: z.enum(['process', 'store', 'external']).optional(),
});

export const CatalogTypeSchema = z.object({
  type: z.string().min(1),
  domain: DomainSchema,
  label: z.string().min(1),
  icon: z.string().min(1),
  fields: z.array(FieldDefSchema),
  protocols: z.array(ProtocolSchema),
  pins: z.array(PinDefSchema).optional(),
  exportHints: ExportHintsSchema.default({}),
});
export type CatalogType = z.infer<typeof CatalogTypeSchema>;

export const NodeSchema = z.object({
  id: Id,
  domain: DomainSchema,
  type: z.string().min(1),
  /** The preset a part was built from (a PRESETS id), for exports that need the real part. */
  preset: z.string().min(1).max(64).optional(),
  label: z.string().min(1).max(120),
  parent: Id.optional(),
  props: Props.default({}),
  /** Concrete pin list (copied from a preset); overrides the catalog type's pins. */
  pins: z.array(PinDefSchema).optional(),
  deploy: z
    .object({
      target: z.enum(['docker', 'aws', 'gcp', 'onprem', 'edge']),
      size: z.string().optional(),
    })
    .optional(),
  notes: z.string().max(20_000).optional(),
});
export type ArchNode = z.infer<typeof NodeSchema>;

export const PinMapSchema = z.object({
  role: PinRoleSchema,
  sourcePin: z.string().min(1),
  targetPin: z.string().min(1),
});
export type PinMap = z.infer<typeof PinMapSchema>;

export const PayloadSchema = z.object({
  schemaName: z.string().min(1),
  fields: z.array(z.object({ name: z.string().min(1), type: z.string().min(1) })),
  sizeBytes: z.number().nonnegative(),
  ratePerSec: z.number().nonnegative(),
  topic: z.string().optional(),
});
export type Payload = z.infer<typeof PayloadSchema>;

export const EdgeSchema = z.object({
  id: Id,
  source: Id,
  target: Id,
  protocol: ProtocolSchema,
  pins: z.array(PinMapSchema).optional(),
  props: Props.default({}),
  payload: PayloadSchema.optional(),
});
export type ArchEdge = z.infer<typeof EdgeSchema>;

const Point = z.object({ x: z.number(), y: z.number() });

export const ViewSchema = z.object({
  id: Id,
  kind: z.enum(['domain', 'overview', 'drill']),
  domain: DomainSchema.optional(),
  rootNodeId: Id.optional(),
  positions: z.record(z.string(), Point).default({}),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
});
export type View = z.infer<typeof ViewSchema>;

export const FlowSchema = z.object({
  id: Id,
  name: z.string().min(1),
  steps: z.array(Id),
  slaMs: z.number().positive().optional(),
});
export type Flow = z.infer<typeof FlowSchema>;

export const BoundarySchema = z.object({
  id: Id,
  name: z.string().min(1),
  trust: z.enum(['internet', 'dmz', 'internal', 'device']),
  nodeIds: z.array(Id),
});
export type Boundary = z.infer<typeof BoundarySchema>;

const ArchDocShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  meta: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(5_000).default(''),
    exportLang: z.enum(['en', 'tr']).default('en'),
  }),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  views: z.array(ViewSchema),
  flows: z.array(FlowSchema).default([]),
  boundaries: z.array(BoundarySchema).default([]),
  pricingOverrides: z.record(z.string(), z.number().nonnegative()).default({}),
  customTypes: z.array(CatalogTypeSchema).default([]),
});

type DocShape = z.infer<typeof ArchDocShape>;
type Path = (string | number)[];

/** Referential integrity: every id reference must point at something that exists. */
function checkIntegrity(doc: DocShape, ctx: z.RefinementCtx) {
  const issue = (path: Path, message: string) => ctx.addIssue({ code: 'custom', path, message });

  const uniqueIds = (key: 'nodes' | 'edges' | 'views' | 'flows' | 'boundaries') => {
    const seen = new Set<string>();
    doc[key].forEach((item, i) => {
      if (seen.has(item.id)) issue([key, i, 'id'], `duplicate id "${item.id}"`);
      seen.add(item.id);
    });
    return seen;
  };
  const nodeIds = uniqueIds('nodes');
  const edgeIds = uniqueIds('edges');
  uniqueIds('views');
  uniqueIds('flows');
  uniqueIds('boundaries');

  const typeNames = new Set<string>();
  doc.customTypes.forEach((t, i) => {
    if (typeNames.has(t.type)) issue(['customTypes', i, 'type'], `duplicate type "${t.type}"`);
    typeNames.add(t.type);
  });

  const parentOf = new Map(doc.nodes.map((n) => [n.id, n.parent]));
  doc.nodes.forEach((n, i) => {
    if (n.parent === undefined) return;
    if (!nodeIds.has(n.parent)) return issue(['nodes', i, 'parent'], `unknown node "${n.parent}"`);
    // Walk up the parent chain; revisiting a node means a cycle.
    const visited = new Set([n.id]);
    for (let p: string | undefined = n.parent; p !== undefined; p = parentOf.get(p)) {
      if (visited.has(p)) return issue(['nodes', i, 'parent'], `parent cycle at "${n.id}"`);
      visited.add(p);
    }
  });

  doc.edges.forEach((e, i) => {
    if (!nodeIds.has(e.source)) issue(['edges', i, 'source'], `unknown node "${e.source}"`);
    if (!nodeIds.has(e.target)) issue(['edges', i, 'target'], `unknown node "${e.target}"`);
    if (e.source === e.target) issue(['edges', i], 'edge cannot connect a node to itself');
  });

  doc.views.forEach((v, i) => {
    if (v.kind === 'domain' && !v.domain)
      issue(['views', i, 'domain'], 'domain view needs a domain');
    if (v.kind === 'drill' && !v.rootNodeId)
      issue(['views', i, 'rootNodeId'], 'drill view needs a root node');
    if (v.rootNodeId && !nodeIds.has(v.rootNodeId))
      issue(['views', i, 'rootNodeId'], `unknown node "${v.rootNodeId}"`);
    for (const id of Object.keys(v.positions))
      if (!nodeIds.has(id)) issue(['views', i, 'positions', id], `unknown node "${id}"`);
  });

  doc.flows.forEach((f, i) =>
    f.steps.forEach((s, j) => {
      if (!edgeIds.has(s)) issue(['flows', i, 'steps', j], `unknown edge "${s}"`);
    }),
  );

  doc.boundaries.forEach((b, i) =>
    b.nodeIds.forEach((id, j) => {
      if (!nodeIds.has(id)) issue(['boundaries', i, 'nodeIds', j], `unknown node "${id}"`);
    }),
  );
}

export const ArchDocSchema = ArchDocShape.superRefine(checkIntegrity);
export type ArchDoc = z.infer<typeof ArchDocSchema>;
export type ArchDocInput = z.input<typeof ArchDocSchema>;

/** A fresh document: one view per domain tab plus the overview. */
export function createEmptyDoc(name: string): ArchDoc {
  return {
    version: SCHEMA_VERSION,
    meta: { name, description: '', exportLang: 'en' },
    nodes: [],
    edges: [],
    views: [
      ...DOMAINS.map((domain) => ({ id: domain, kind: 'domain' as const, domain, positions: {} })),
      { id: 'overview', kind: 'overview', positions: {} },
    ],
    flows: [],
    boundaries: [],
    pricingOverrides: {},
    customTypes: [],
  };
}
