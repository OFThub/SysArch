import type { Catalog } from '../catalog';
import type { ArchDoc, ArchNode } from '../schema';
import type { ExportFile } from './architecture';
import { inComment } from './comment';
import { containers, type Container } from './containers';

/*
 * Terraform starting points, one root module per provider: terraform/aws for
 * the components meant for the cloud, terraform/docker for the containers
 * of docker-compose.yml. Each gets the arguments its provider requires and
 * small default sizes. What a person must decide (images, networking,
 * credentials) is left as a comment, not invented.
 */

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A Terraform block name: letters, digits, underscores; never a leading digit. */
const tfName = (id: string) => {
  const s = id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return /^[a-z_]/.test(s) ? s : `c_${s}`;
};
/** A cloud resource name: lowercase letters, digits and dashes. */
const slug = (s: string) =>
  s
    .replaceAll('ı', 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sysarch';
const named = (n: ArchNode, max?: number) =>
  max ? `substr("\${var.project}-${slug(n.id)}", 0, ${max})` : `"\${var.project}-${slug(n.id)}"`;

const file = (path: string, lines: string[]): ExportFile => ({
  path,
  content: `${lines.join('\n').trimEnd()}\n`,
});
const providers = (name: string, source: string, version: string) => [
  'terraform {',
  '  required_providers {',
  `    ${name} = {`,
  `      source  = "${source}"`,
  `      version = "${version}"`,
  '    }',
  '  }',
  '}',
  '',
];
const notGenerated = (skipped: string[]) =>
  skipped.length ? ['# Not generated:', ...skipped.map((s) => `#   ${inComment(s)}`), ''] : [];
const projectVariable = (doc: ArchDoc) => [
  'variable "project" {',
  '  description = "Prefix for every resource name."',
  '  type        = string',
  `  default     = "${slug(doc.meta.name).slice(0, 20)}"`,
  '}',
  '',
];

// -------------------------------------------------------------------- AWS

const DB_ENGINES: Record<string, string> = { PostgreSQL: 'postgres', MySQL: 'mysql' };
const CACHE_ENGINES: Record<string, string> = {
  Redis: 'redis',
  Valkey: 'valkey',
  Memcached: 'memcached',
};

/** A resource block as lines, or the reason it was left out. */
function block(n: ArchNode, resource: string): string[] | string {
  const head = `resource "${resource}" "${tfName(n.id)}" {`;
  const label = `  # ${inComment(n.label)}`;
  switch (resource) {
    case 'aws_ecs_service':
      return [
        head,
        label,
        `  name          = ${named(n)}`,
        '  cluster       = aws_ecs_cluster.main.id',
        '  launch_type   = "FARGATE"',
        '  desired_count = 1',
        '  # Build and push the image, then set task_definition and network_configuration.',
        '}',
      ];
    case 'aws_db_instance': {
      const engine = DB_ENGINES[String(n.props.engine)];
      if (!engine) return `${n.label}: no RDS engine for ${String(n.props.engine)}`;
      // RDS takes 20 to 65536 GB; anything else (unset, NaN, Infinity) falls back to 20.
      const gb = Number(n.props.storageGb);
      const storage = Number.isFinite(gb) ? Math.min(65_536, Math.max(20, Math.round(gb))) : 20;
      return [
        head,
        label,
        `  identifier                  = ${named(n)}`,
        `  engine                      = "${engine}"`,
        '  instance_class              = "db.t4g.micro"',
        `  allocated_storage           = ${storage}`,
        '  username                    = "app"',
        '  manage_master_user_password = true',
        '  skip_final_snapshot         = true',
        '}',
      ];
    }
    case 'aws_elasticache_cluster': {
      const engine = CACHE_ENGINES[String(n.props.engine)] ?? 'redis';
      return [
        head,
        label,
        `  cluster_id      = ${named(n, 40)}`,
        `  engine          = "${engine}"`,
        '  node_type       = "cache.t4g.micro"',
        '  num_cache_nodes = 1',
        '}',
      ];
    }
    case 'aws_sqs_queue':
      return [head, label, `  name = ${named(n)}`, '}'];
    case 'aws_lb':
      return [
        head,
        label,
        `  name               = ${named(n, 32)}`,
        '  load_balancer_type = "application"',
        '  internal           = false',
        '  subnets            = var.subnet_ids',
        '}',
      ];
    case 'aws_s3_bucket':
      return [head, label, `  bucket = ${named(n)}`, '}'];
    default:
      return `${n.label}: ${resource} is not generated yet`;
  }
}

/** terraform/aws: the components whose catalog type names an AWS resource. */
function awsFiles(doc: ArchDoc, catalog: Catalog): ExportFile[] {
  const blocks: string[][] = [];
  const skipped: string[] = [];
  for (const n of [...doc.nodes].sort(byId)) {
    const resource = catalog.get(n.type)?.exportHints.terraformResource?.aws;
    if (!resource || (n.deploy && n.deploy.target !== 'aws')) continue;
    const b = block(n, resource);
    if (typeof b === 'string') skipped.push(b);
    else blocks.push(b);
  }
  if (!blocks.length) return [];

  const main = [
    `# Generated by SysArch for "${inComment(doc.meta.name)}". A starting point: review sizes,`,
    '# networking and credentials before applying.',
    ...providers('aws', 'hashicorp/aws', '~> 6.0'),
    'provider "aws" {',
    '  region = var.region',
    '}',
    '',
  ];
  if (blocks.some((b) => b[0]!.startsWith('resource "aws_ecs_service"')))
    main.push('resource "aws_ecs_cluster" "main" {', '  name = var.project', '}', '');
  for (const b of blocks) main.push(...b, '');
  main.push(...notGenerated(skipped));

  return [
    file('terraform/aws/main.tf', main),
    file('terraform/aws/variables.tf', [
      ...projectVariable(doc),
      'variable "region" {',
      '  type    = string',
      '  default = "eu-central-1"',
      '}',
      '',
      'variable "subnet_ids" {',
      '  description = "Subnets for load balancers; an application load balancer needs two."',
      '  type        = list(string)',
      '  default     = []',
      '}',
    ]),
  ];
}

// ----------------------------------------------------------------- Docker

/*
 * Image names and ports can come from a project's custom types, so they are
 * user text inside HCL. Only what Docker itself accepts gets through, and
 * none of it can close a string or open a ${...} template.
 */
const IMAGE = /^[a-z0-9][\w./:@-]*$/i;
/** Compose short syntax "host:container" or "container". */
const PORT = /^(?:(\d{1,5}):)?(\d{1,5})$/;
const validPort = (p: string | undefined) => p === undefined || (+p >= 1 && +p <= 65_535);

/** A container's lines: image, data volume, container. */
function dockerBlocks(c: Container, started: Set<string>, skipped: string[]): string[] {
  const id = tfName(c.name);
  const lines = c.build
    ? [
        `resource "docker_image" "${id}" {`,
        `  name = "\${var.project}-${c.name}"`,
        '  build {',
        `    context = "\${path.module}/../../${c.build}"`,
        '  }',
        '}',
        '',
      ]
    : [`resource "docker_image" "${id}" {`, `  name = "${c.image}"`, '}', ''];
  if (c.data)
    lines.push(
      `resource "docker_volume" "${id}_data" {`,
      `  name = "\${var.project}-${c.name}-data"`,
      '}',
      '',
    );

  lines.push(
    `resource "docker_container" "${id}" {`,
    `  # ${inComment(c.node.label)}`,
    `  name  = "\${var.project}-${c.name}"`,
    `  image = docker_image.${id}.image_id`,
  );
  if (c.secrets.length)
    lines.push(
      `  env   = [${c.secrets.map((k) => `"${k}=\${var.${k.toLowerCase()}}"`).join(', ')}]`,
    );
  for (const p of c.ports) {
    const m = PORT.exec(p);
    if (!m || !validPort(m[1]) || !validPort(m[2])) {
      skipped.push(`${c.node.label}: port ${p} is not host:container`);
      continue;
    }
    lines.push('  ports {', `    internal = ${m[2]}`);
    if (m[1]) lines.push(`    external = ${m[1]}`);
    lines.push('  }');
  }
  if (c.data)
    lines.push(
      '  volumes {',
      `    volume_name    = docker_volume.${id}_data.name`,
      `    container_path = "${c.data}"`,
      '  }',
    );
  for (const [from, to] of c.files)
    lines.push(
      '  volumes {',
      `    host_path      = abspath("\${path.module}/../../${from}")`,
      `    container_path = "${to}"`,
      '    read_only      = true',
      '  }',
    );
  // The alias keeps compose's hostnames, so code that reaches "db" works under both.
  lines.push(
    '  networks_advanced {',
    '    name    = docker_network.app.id',
    `    aliases = ["${c.name}"]`,
    '  }',
  );
  const deps = c.dependsOn.filter((d) => started.has(d));
  if (deps.length)
    lines.push(`  depends_on = [${deps.map((d) => `docker_container.${tfName(d)}`).join(', ')}]`);
  lines.push('}', '');
  return lines;
}

/** terraform/docker: the containers of docker-compose.yml, for teams that run Docker through Terraform. */
function dockerFiles(doc: ArchDoc, catalog: Catalog): ExportFile[] {
  const skipped: string[] = [];
  const list = containers(doc, catalog).filter((c) => {
    if (c.build || IMAGE.test(c.image ?? '')) return true;
    skipped.push(`${c.node.label}: ${c.image ?? ''} is not a Docker image name`);
    return false;
  });
  if (!list.length) return [];
  const started = new Set(list.map((c) => c.name));

  const main = [
    `# Generated by SysArch for "${inComment(doc.meta.name)}": the containers of`,
    '# docker-compose.yml, run through Terraform. Images with a build block need',
    '# their code and a Dockerfile in ../../services/<name>.',
    ...providers('docker', 'kreuzwerker/docker', '~> 4.0'),
    'provider "docker" {}',
    '',
    'resource "docker_network" "app" {',
    '  name = var.project',
    '}',
    '',
  ];
  for (const c of list) main.push(...dockerBlocks(c, started, skipped));
  main.push(...notGenerated(skipped));

  const secrets = [...new Set(list.flatMap((c) => c.secrets))].sort();
  const variables = projectVariable(doc);
  if (secrets.length)
    variables.push('# Terraform keeps these in its state: keep the state private.');
  for (const k of secrets)
    variables.push(
      `variable "${k.toLowerCase()}" {`,
      '  type      = string',
      '  sensitive = true',
      '}',
      '',
    );

  return [file('terraform/docker/main.tf', main), file('terraform/docker/variables.tf', variables)];
}

/** Terraform for AWS and for Docker; nothing for a provider no component maps to. */
export const terraformFiles = (doc: ArchDoc, catalog: Catalog): ExportFile[] => [
  ...awsFiles(doc, catalog),
  ...dockerFiles(doc, catalog),
];
