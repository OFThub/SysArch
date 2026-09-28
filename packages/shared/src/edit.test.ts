import { describe, expect, it } from 'vitest';
import { ClipSchema, copySubgraph, pasteSubgraph, removeElements } from './edit';
import { ArchDocSchema } from './schema';
import { seraIot } from './templates';

describe('removeElements', () => {
  it('cascades a node removal to its edges, positions, flows and boundaries', () => {
    const doc = seraIot();
    doc.flows = [{ id: 'f1', name: 'store', steps: ['e-subscribe', 'e-store'] }];
    doc.boundaries = [{ id: 'b1', name: 'cloud', trust: 'internal', nodeIds: ['api', 'db'] }];

    const next = removeElements(doc, ['db'], []);

    expect(next.nodes.some((n) => n.id === 'db')).toBe(false);
    expect(next.edges.map((e) => e.id)).not.toContain('e-store');
    expect(next.edges.map((e) => e.id)).not.toContain('e-export');
    expect(next.views.every((v) => !('db' in v.positions))).toBe(true);
    expect(next.flows[0]!.steps).toEqual(['e-subscribe']);
    expect(next.boundaries[0]!.nodeIds).toEqual(['api']);
    // The result is still a valid document.
    expect(ArchDocSchema.safeParse(next).success).toBe(true);
  });

  it('moves children of a removed node up and drops drill views rooted at it', () => {
    const doc = seraIot();
    doc.nodes.find((n) => n.id === 'api')!.parent = 'mqtt';
    doc.nodes.find((n) => n.id === 'db')!.parent = 'api';
    doc.views.push({ id: 'drill-api', kind: 'drill', rootNodeId: 'api', positions: {} });

    const next = removeElements(doc, ['api'], []);

    expect(next.nodes.find((n) => n.id === 'db')!.parent).toBe('mqtt');
    expect(next.views.some((v) => v.id === 'drill-api')).toBe(false);
    expect(ArchDocSchema.safeParse(next).success).toBe(true);
  });

  it('removes a single edge without touching nodes', () => {
    const doc = seraIot();
    const next = removeElements(doc, [], ['e-bme']);
    expect(next.nodes).toHaveLength(doc.nodes.length);
    expect(next.edges).toHaveLength(doc.edges.length - 1);
  });
});

describe('copySubgraph / pasteSubgraph', () => {
  it('copies only edges inside the selection and pastes with fresh ids and offset', () => {
    const doc = seraIot();
    const clip = copySubgraph(doc, ['esp32', 'bme280'], 'hardware');
    expect(clip.edges.map((e) => e.id).sort()).toEqual(['e-bme', 'p-bme']);
    expect(ClipSchema.safeParse(JSON.parse(JSON.stringify(clip))).success).toBe(true);

    const { doc: next, nodeIds, edgeIds } = pasteSubgraph(doc, clip, 'hardware', { x: 40, y: 40 });

    expect(nodeIds).toHaveLength(2);
    expect(edgeIds).toHaveLength(2);
    expect(nodeIds.some((id) => id === 'esp32')).toBe(false);
    const hw = next.views.find((v) => v.id === 'hardware')!;
    expect(hw.positions[nodeIds[0]!]).toEqual({ x: 340, y: 160 });
    expect(ArchDocSchema.safeParse(next).success).toBe(true);
  });

  it('drops a parent that was not copied and brings missing custom types along', () => {
    const doc = seraIot();
    doc.customTypes = [
      {
        type: 'lidar',
        domain: 'hardware',
        label: 'LiDAR',
        icon: 'radar',
        fields: [],
        protocols: ['UART'],
        exportHints: {},
      },
    ];
    doc.nodes.push({
      id: 'l1',
      domain: 'hardware',
      type: 'lidar',
      label: 'TF-Luna',
      parent: 'esp32',
      props: {},
    });

    const clip = copySubgraph(doc, ['l1'], 'hardware');
    expect(clip.nodes[0]!.parent).toBeUndefined();
    expect(clip.customTypes.map((t) => t.type)).toEqual(['lidar']);

    const target = seraIot();
    const { doc: next } = pasteSubgraph(target, clip, 'hardware', { x: 0, y: 0 });
    expect(next.customTypes.map((t) => t.type)).toEqual(['lidar']);
    expect(ArchDocSchema.safeParse(next).success).toBe(true);
  });
});
