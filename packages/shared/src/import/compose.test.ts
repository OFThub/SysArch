import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { applyOps } from '../ops';
import { seraIot } from '../templates';
import { importOps, ImportError } from './common';
import { fromCompose } from './compose';

const catalog = effectiveCatalog();

const COMPOSE = `
services:
  web:
    build: ./web
    ports: ["5173:5173"]
    depends_on: [api]
  api:
    build: .
    ports:
      - "8080:3000"
    depends_on:
      db: { condition: service_healthy }
      cache: {}
      broker: {}
  db:
    image: postgres:17-alpine
  cache:
    image: redis:7
  broker:
    image: eclipse-mosquitto:2
  proxy:
    image: nginx:alpine
    depends_on: [web, missing]
  grafana:
    image: grafana/grafana
`;

describe('docker-compose import', () => {
  it('types services by image or as own code, and links each depends_on', () => {
    const r = fromCompose(COMPOSE, catalog);
    const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    expect(Object.fromEntries(r.nodes.map((n) => [n.id, n.type]))).toEqual({
      web: 'frontend',
      api: 'api',
      db: 'database',
      cache: 'cache',
      broker: 'queue',
      proxy: 'gateway',
      grafana: 'api',
    });
    expect(byId.api!.props.port).toBe(3000);
    expect(byId.db!.props.engine).toBe('PostgreSQL');
    expect(byId.db!.deploy).toEqual({ target: 'docker' });
    expect(r.edges.map((e) => `${e.source}>${e.target} ${e.protocol}`)).toEqual([
      'web>api HTTP',
      'api>db SQL',
      'api>cache TCP',
      'api>broker MQTT',
      'proxy>web HTTP',
    ]);
    expect(r.notes).toEqual([
      { code: 'guessed', subject: 'grafana' },
      { code: 'skipped', subject: 'proxy → missing' },
    ]);
  });

  it('adds to a doc under free ids, links following the renames', () => {
    const doc = seraIot();
    const ops = importOps(doc, fromCompose(COMPOSE, catalog));
    const r = applyOps(doc, ops);
    expect(r.errors).toEqual([]);
    // The template already has an "api" and a "db".
    expect(r.doc.nodes.find((n) => n.id === 'api-2')?.label).toBe('api');
    expect(r.doc.edges.find((e) => e.id === 'api-db')).toMatchObject({
      source: 'api-2',
      target: 'db-2',
    });
  });

  it('rejects text that is not a compose file', () => {
    expect(() => fromCompose('services: [', catalog)).toThrow(ImportError);
    expect(() => fromCompose('name: x\n', catalog)).toThrow(
      expect.objectContaining({ code: 'empty' }),
    );
  });
});
