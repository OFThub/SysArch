import { describe, expect, it } from 'vitest';
import { ArchDocSchema, createEmptyDoc, type ArchDocInput } from './schema';

function doc(patch: Partial<ArchDocInput> = {}): ArchDocInput {
  return {
    ...createEmptyDoc('test'),
    nodes: [
      { id: 'mcu', domain: 'hardware', type: 'mcu', label: 'ESP32-S3' },
      { id: 'bme', domain: 'hardware', type: 'sensor', label: 'BME280' },
    ],
    edges: [{ id: 'e1', source: 'mcu', target: 'bme', protocol: 'I2C' }],
    ...patch,
  };
}

function errors(input: ArchDocInput): string[] {
  const r = ArchDocSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('ArchDocSchema', () => {
  it('accepts a minimal valid doc and fills defaults', () => {
    const r = ArchDocSchema.parse(doc());
    expect(r.nodes[0]?.props).toEqual({});
    expect(r.views.map((v) => v.id)).toEqual(['fullstack', 'ai', 'hardware', 'overview']);
  });

  it('rejects an edge pointing at a missing node', () => {
    const e = errors(
      doc({ edges: [{ id: 'e1', source: 'mcu', target: 'ghost', protocol: 'I2C' }] }),
    );
    expect(e).toEqual(['edges.0.target: unknown node "ghost"']);
  });

  it('rejects duplicate node ids', () => {
    const d = doc();
    d.nodes.push({ id: 'mcu', domain: 'hardware', type: 'mcu', label: 'dup' });
    expect(errors(d)).toContain('nodes.2.id: duplicate id "mcu"');
  });

  it('rejects a parent cycle', () => {
    const d = doc();
    d.nodes[0]!.parent = 'bme';
    d.nodes[1]!.parent = 'mcu';
    expect(errors(d).some((m) => m.includes('parent cycle'))).toBe(true);
  });

  it('rejects positions, flow steps and boundary members that do not exist', () => {
    const d = doc({
      flows: [{ id: 'f1', name: 'read', steps: ['e1', 'nope'] }],
      boundaries: [{ id: 'b1', name: 'device', trust: 'device', nodeIds: ['ghost'] }],
    });
    d.views[2]!.positions = { ghost: { x: 0, y: 0 } };
    expect(errors(d)).toEqual([
      'views.2.positions.ghost: unknown node "ghost"',
      'flows.0.steps.1: unknown edge "nope"',
      'boundaries.0.nodeIds.0: unknown node "ghost"',
    ]);
  });

  it('requires a domain on domain views and a root on drill views', () => {
    const d = doc({
      views: [
        { id: 'v', kind: 'domain', positions: {} },
        { id: 'd', kind: 'drill' },
      ],
    });
    expect(errors(d)).toEqual([
      'views.0.domain: domain view needs a domain',
      'views.1.rootNodeId: drill view needs a root node',
    ]);
  });

  it('keeps a doc that uses a custom type self-contained and valid', () => {
    const r = ArchDocSchema.safeParse(
      doc({
        customTypes: [
          {
            type: 'lidar',
            domain: 'hardware',
            label: 'LiDAR',
            icon: 'radar',
            fields: [{ key: 'rangeM', label: 'Menzil', kind: 'number', unit: 'm' }],
            protocols: ['UART'],
          },
        ],
        nodes: [{ id: 'l1', domain: 'hardware', type: 'lidar', label: 'TF-Luna' }],
        edges: [],
      }),
    );
    expect(r.success).toBe(true);
  });
});
