import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { ImportError } from './common';
import { fromMermaid } from './mermaid';

const catalog = effectiveCatalog();
const summary = (text: string) => {
  const r = fromMermaid(text, catalog);
  return {
    nodes: Object.fromEntries(r.nodes.map((n) => [n.id, `${n.type} ${n.label}`])),
    edges: r.edges.map((e) => `${e.source}>${e.target} ${e.protocol}`),
    notes: r.notes,
  };
};

describe('Mermaid import', () => {
  it('reads shapes, chains, & groups and link texts', () => {
    const r = summary(`
      flowchart LR
        %% the web side
        user((Kullanıcı)) --> web[Web panel]
        web -->|REST| api[Sera API]
        api -- SQL --> db[(Ölçümler)]
        api --> cache[Redis] & q[MQTT broker]
        subgraph ai [AI]
          llm["Claude özet"]
        end
        api -.-> llm
        classDef hot fill:#f00
        this is not mermaid
    `);
    expect(r.nodes).toEqual({
      user: 'api Kullanıcı',
      web: 'frontend Web panel',
      api: 'api Sera API',
      db: 'database Ölçümler',
      cache: 'cache Redis',
      q: 'queue MQTT broker',
      llm: 'llm_api Claude özet',
    });
    expect(r.edges).toEqual([
      'user>web HTTP',
      'web>api HTTP',
      'api>db SQL',
      'api>cache TCP',
      'api>q MQTT',
      'api>llm HTTP',
    ]);
    expect(r.notes).toEqual([
      { code: 'skipped', subject: 'this is not mermaid' },
      { code: 'guessed', subject: 'Kullanıcı' },
    ]);
  });

  it('reads back the flowcharts our ARCHITECTURE.md writes', () => {
    const r = summary(`flowchart LR
  n_api["Sera API"]
  n_db["Ölçüm veritabanı"]
  n_mqtt["Mosquitto"]
  n_api -->|SQL| n_db
  n_api -->|MQTT| n_mqtt`);
    expect(r.nodes).toEqual({
      n_api: 'api Sera API',
      n_db: 'database Ölçüm veritabanı',
      n_mqtt: 'queue Mosquitto',
    });
    expect(r.edges).toEqual(['n_api>n_db SQL', 'n_api>n_mqtt MQTT']);
  });

  it('rejects other diagram kinds', () => {
    expect(() => fromMermaid('sequenceDiagram\n  A->>B: hi', catalog)).toThrow(
      expect.objectContaining({ code: 'format' }),
    );
    expect(() => fromMermaid('', catalog)).toThrow(ImportError);
  });
});
