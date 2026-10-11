import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { applyOps } from '../ops';
import { createEmptyDoc, type CatalogType } from '../schema';
import { importOps } from './common';
import awsPlanJson from './fixtures/terraform-aws-plan.json';
import dockerStateJson from './fixtures/terraform-docker-state.json';
import { readSource } from './read';
import { fromTerraform } from './terraform';

const catalog = effectiveCatalog();
// Real `terraform show -json` output: a plan of an AWS web app, and the state
// of the Docker module the Terraform export writes, applied and read back.
const awsPlan = JSON.stringify(awsPlanJson);
const dockerState = JSON.stringify(dockerStateJson);
const links = (r: ReturnType<typeof fromTerraform>) =>
  r.edges.map((e) => `${e.source}>${e.target}`).sort();

describe('Terraform import', () => {
  it('reads a plan: a component per resource that is one, a link per real dependency', () => {
    const r = readSource(awsPlan, catalog);
    expect(r.format).toBe('terraform');
    const byId = new Map(r.nodes.map((n) => [n.id, n]));
    expect([...byId.keys()].sort()).toEqual([
      'api',
      'dlq',
      'edge',
      'jobs',
      'orders',
      'sessions',
      'shard',
      'uploads',
      'users',
      'worker',
    ]);
    expect(byId.get('orders')).toMatchObject({
      type: 'database',
      props: { engine: 'PostgreSQL', storageGb: 50 },
      deploy: { target: 'aws' },
    });
    expect(byId.get('sessions')!.props.engine).toBe('Redis');
    // The Name tag wins over the resource name; a module's "this" goes by the module.
    expect(byId.get('edge')).toMatchObject({ type: 'gateway', label: 'Vitrin dengeleyici' });
    expect(byId.get('dlq')!.type).toBe('queue');

    expect(links(r)).toEqual([
      // The ECS service reaches its stores through the task definition.
      'api>jobs',
      'api>orders',
      'api>sessions',
      'api>users',
      // Behind the load balancer: listener → target group → service.
      'edge>api',
      // The Lambda reads the queue an event source mapping feeds it.
      'worker>jobs',
      'worker>uploads',
    ]);
    expect(r.notes).toContainEqual({ code: 'skipped', subject: 'aws_subnet ×2' });
    expect(r.notes).toContainEqual({ code: 'skipped', subject: 'aws_iam_role' });
  });

  it('reads a state: containers typed by the image they run, links from depends_on', () => {
    const r = fromTerraform(dockerState, catalog);
    expect(r.nodes.map((n) => [n.id, n.type, n.deploy?.target])).toEqual([
      ['db', 'database', 'docker'],
      ['edge', 'gateway', 'docker'],
      ['sessions', 'cache', 'docker'],
    ]);
    expect(links(r)).toEqual(['edge>db', 'edge>sessions']);
    // Images, networks and volumes are what containers are made of, not news.
    expect(r.notes).toEqual([]);
  });

  it('never carries attribute values across, so secrets in state stay behind', () => {
    expect(dockerState).toContain('CANARY-SECRET-MUST-NOT-IMPORT');
    const ops = importOps(createEmptyDoc('x'), fromTerraform(dockerState, catalog));
    expect(JSON.stringify(ops)).not.toContain('CANARY');
  });

  it('becomes ops the design accepts as they are', () => {
    for (const text of [awsPlan, dockerState]) {
      const doc = createEmptyDoc('x');
      const { errors } = applyOps(doc, importOps(doc, readSource(text, catalog)));
      expect(errors).toEqual([]);
    }
  });

  it('imports any resource a custom type names', () => {
    const dynamo: CatalogType = {
      type: 'dynamo',
      domain: 'fullstack',
      label: 'DynamoDB',
      icon: 'database',
      fields: [],
      protocols: ['HTTP'],
      exportHints: { terraformResource: { aws: 'aws_dynamodb_table' } },
    };
    const state = JSON.stringify({
      format_version: '1.0',
      values: {
        root_module: {
          resources: [
            {
              address: 'aws_dynamodb_table.carts',
              mode: 'managed',
              type: 'aws_dynamodb_table',
              name: 'carts',
              values: {},
            },
          ],
        },
      },
    });
    expect(fromTerraform(state, effectiveCatalog([dynamo])).nodes[0]).toMatchObject({
      id: 'carts',
      type: 'dynamo',
    });
    expect(() => fromTerraform(state, catalog)).toThrow(expect.objectContaining({ code: 'empty' }));
  });

  it('says what it cannot read', () => {
    expect(() => fromTerraform('{"format_version":', catalog)).toThrow(
      expect.objectContaining({ code: 'syntax' }),
    );
    expect(() => fromTerraform('{"format_version":"1.0"}', catalog)).toThrow(
      expect.objectContaining({ code: 'format' }),
    );
    // JSON without a format_version is still a Wokwi diagram.
    expect(readSource('{"parts": [{"id": "led1", "type": "wokwi-led"}]}', catalog).format).toBe(
      'wokwi',
    );
  });
});
