import { seraIot } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { archEdgeId, buildFlow } from './viewModel';

const doc = seraIot();

describe('buildFlow', () => {
  it('shows a domain tab with its cross-domain neighbours as proxies', () => {
    const { nodes, edges } = buildFlow(doc, 'hardware');
    const proxies = nodes.filter((n) => n.data.proxy).map((n) => n.id);
    expect(proxies).toEqual(['mqtt']);
    expect(nodes.filter((n) => !n.data.proxy).every((n) => n.data.node.domain === 'hardware')).toBe(
      true,
    );
    expect(edges.map((e) => e.id)).toContain('e-publish');
  });

  it('omits edges between two proxies', () => {
    // In the AI tab, db and api are both proxies; their SQL link belongs to fullstack.
    const { edges } = buildFlow(doc, 'ai');
    expect(edges.map((e) => e.id)).not.toContain('e-store');
  });

  it('frames every domain in the overview and has no proxies', () => {
    const { nodes, frames } = buildFlow(doc, 'overview');
    expect(nodes).toHaveLength(doc.nodes.length);
    expect(nodes.some((n) => n.data.proxy)).toBe(false);
    expect(frames.map((f) => f.domain).sort()).toEqual(['ai', 'fullstack', 'hardware']);
  });

  it('stacks unpositioned nodes in a column right of the placed ones', () => {
    const d = seraIot();
    d.views.find((v) => v.id === 'hardware')!.positions = { esp32: { x: 100, y: 0 } };
    const pos = buildFlow(d, 'hardware').nodes.map((n) => n.position);
    expect(pos[0]).toEqual({ x: 100, y: 0 });
    expect(pos.slice(1).every((p) => p.x === 420)).toBe(true);
    expect(new Set(pos.slice(1).map((p) => p.y)).size).toBe(pos.length - 1);
  });

  it('returns an empty model for an unknown view', () => {
    expect(buildFlow(doc, 'nope')).toEqual({ nodes: [], edges: [], frames: [] });
  });

  it('splits pin-mapped edges into one line per pin between labelled pads', () => {
    const { nodes, edges } = buildFlow(doc, 'hardware');
    const bme = edges.filter((e) => archEdgeId(e.id) === 'e-bme');
    expect(bme.map((e) => [e.id, e.sourceHandle, e.targetHandle])).toEqual([
      ['e-bme/SDA', 'out:GPIO8', 'in:SDA'],
      ['e-bme/SCL', 'out:GPIO9', 'in:SCL'],
    ]);
    // Two I2C devices share GPIO8/9, so the ESP32 shows each pad once, in header order.
    const esp = nodes.find((n) => n.id === 'esp32')!.data.pads;
    expect(esp.out.map((p) => p.label)).toEqual(['GPIO4', 'GPIO8', 'GPIO9', '3V3', 'GND', 'MQTT']);
    expect(esp.in.map((p) => p.label)).toEqual(['5V', 'GND']);
  });

  it('spreads lines leaving one node over distinct lanes centred on zero', () => {
    const lanes = buildFlow(doc, 'hardware')
      .edges.filter((e) => e.source === 'esp32')
      .map((e) => e.data!.lane);
    expect(new Set(lanes).size).toBe(lanes.length);
    expect(lanes.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });

  it('gives network edges protocol pads and flags wireless and power lines', () => {
    const { edges } = buildFlow(doc, 'hardware');
    const publish = edges.find((e) => e.id === 'e-publish')!;
    expect([publish.sourceHandle, publish.targetHandle]).toEqual(['out:MQTT', 'in:MQTT']);
    expect(publish.data).toMatchObject({ wireless: true, power: false, channel: 'hardware' });
    expect(edges.find((e) => e.id === 'p-esp/VCC')!.data!.power).toBe(true);
  });
});
