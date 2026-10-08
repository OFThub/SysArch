import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { effectiveCatalog } from '../catalog';
import { type ArchDoc, type CatalogType, createEmptyDoc } from '../schema';
import { saasApp, seraIot } from '../templates';
import { composeFiles } from './generators';
import { terraformFiles } from './terraform';

const catalog = effectiveCatalog();
const file = (doc: ArchDoc, path: string, cat = catalog) =>
  terraformFiles(doc, cat).find((f) => f.path === path)!.content;

describe('Terraform export for AWS', () => {
  it('gives each cloud component its AWS resource with the required arguments', () => {
    const tf = file(saasApp(), 'terraform/aws/main.tf');
    for (const r of [
      'resource "aws_lb" "edge"',
      'resource "aws_ecs_service" "api"',
      'resource "aws_ecs_service" "worker"',
      'resource "aws_db_instance" "db"',
      'resource "aws_elasticache_cluster" "sessions"',
      'resource "aws_sqs_queue" "jobs"',
    ])
      expect(tf).toContain(r);
    expect(tf).toContain('engine                      = "postgres"');
    expect(tf).toContain('allocated_storage           = 50');
    // One cluster for every service, declared once.
    expect(tf.match(/resource "aws_ecs_cluster"/g)).toHaveLength(1);
    expect(tf).toContain('source  = "hashicorp/aws"');
  });

  it('leaves out what runs elsewhere and says what it could not map', () => {
    const doc = saasApp();
    doc.nodes.find((n) => n.id === 'jobs')!.deploy = { target: 'docker' };
    doc.nodes.find((n) => n.id === 'db')!.props.engine = 'MongoDB';
    const tf = file(doc, 'terraform/aws/main.tf');
    expect(tf).not.toContain('aws_sqs_queue');
    expect(tf).not.toContain('aws_db_instance');
    expect(tf).toContain('#   Uygulama veritabanı: no RDS engine for MongoDB');
  });

  it('names the project in the variables and writes nothing without cloud parts', () => {
    expect(file(saasApp(), 'terraform/aws/variables.tf')).toContain(
      'default     = "saas-uygulamasi"',
    );
    expect(terraformFiles(createEmptyDoc('Boş'), catalog)).toEqual([]);
  });
});

describe('Terraform export for Docker', () => {
  it('runs the containers of docker-compose.yml under the same hostnames', () => {
    const doc = seraIot();
    const tf = file(doc, 'terraform/docker/main.tf');
    const services = Object.keys(parse(composeFiles(doc, catalog)[0]!.content).services);
    const declared = [...tf.matchAll(/resource "docker_container" "(\w+)"/g)].map((m) => m[1]);
    expect(declared).toEqual(services);
    for (const s of services) expect(tf).toContain(`aliases = ["${s}"]`);

    expect(tf).toContain('source  = "kreuzwerker/docker"');
    expect(tf).toContain('context = "${path.module}/../../services/api"');
    expect(tf).toContain('name = "postgres:17-alpine"');
    expect(tf).toContain('volume_name    = docker_volume.db_data.name');
    expect(tf).toMatch(/internal = 80\n {4}external = 8080/);
    expect(tf).toContain(
      'depends_on = [docker_container.anomaly, docker_container.db, docker_container.mqtt]',
    );
  });

  it('asks for passwords instead of writing them', () => {
    expect(file(seraIot(), 'terraform/docker/main.tf')).toContain(
      'env   = ["POSTGRES_PASSWORD=${var.postgres_password}"]',
    );
    // Sensitive and without a default, so Terraform refuses to run until it is given.
    expect(file(seraIot(), 'terraform/docker/variables.tf')).toContain(
      'variable "postgres_password" {\n  type      = string\n  sensitive = true\n}',
    );
  });

  it("keeps a custom type's image and ports from breaking out of HCL", () => {
    const custom = (type: string, exportHints: CatalogType['exportHints']): CatalogType => ({
      type,
      domain: 'fullstack',
      label: type,
      icon: 'box',
      fields: [],
      protocols: ['HTTP'],
      exportHints,
    });
    const doc = seraIot();
    doc.customTypes = [
      custom('evil', {
        dockerImage: 'x"\n}\nresource "null_resource" "pwn" {\n  t = "${file("/etc/passwd")}',
      }),
      custom('odd', { dockerImage: 'acme/odd:1', composePorts: ['9000:9000', '70000:80', '80"}'] }),
    ];
    doc.nodes.push(
      { id: 'evil', domain: 'fullstack', type: 'evil', label: 'Evil', props: {} },
      { id: 'odd', domain: 'fullstack', type: 'odd', label: 'Odd', props: {} },
    );
    doc.edges.push({ id: 'e-evil', source: 'api', target: 'evil', protocol: 'HTTP', props: {} });

    const tf = file(doc, 'terraform/docker/main.tf', effectiveCatalog(doc.customTypes));
    const code = tf.split('\n').filter((l) => !/^\s*#/.test(l));
    expect(code.filter((l) => /null_resource|passwd|70000|80"/.test(l))).toEqual([]);
    // The image is left out, and so is everything that pointed at it.
    expect(tf).not.toContain('docker_container.evil');
    expect(tf).toContain('internal = 9000');
    expect(tf).toContain('#   Odd: port 70000:80 is not host:container');
  });
});
