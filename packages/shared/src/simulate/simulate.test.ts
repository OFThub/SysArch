import { describe, expect, it } from 'vitest';
import { effectiveCatalog, nodeFromPreset, PRESETS } from '../catalog';
import { createEmptyDoc, type ArchDoc } from '../schema';
import { seraIot } from '../templates';
import { validate } from '../validate';
import { linkLoads, nodeLoads, pathLatency, powerBudgets } from './index';

const catalog = effectiveCatalog();
const rules = (doc: ArchDoc) => validate(doc, catalog).map((i) => i.rule);
const part = (id: string, preset: string) =>
  nodeFromPreset(
    PRESETS.find((p) => p.id === preset)!,
    catalog,
    id,
  );

describe('link load', () => {
  it('flags 50 KB/s over a 115200 baud UART', () => {
    const doc = seraIot();
    doc.nodes.push(part('lora', 'sx1276'));
    doc.edges.push({
      id: 'e-uart',
      source: 'esp32',
      target: 'lora',
      protocol: 'UART',
      props: {},
      payload: { schemaName: 'Frame', fields: [], sizeBytes: 500, ratePerSec: 100 },
    });
    const load = linkLoads(doc).find((l) => l.edgeId === 'e-uart')!;
    expect(load.demandKbps).toBe(400);
    expect(load.capacityKbps).toBe(115.2);
    expect(validate(doc, catalog).find((i) => i.rule === 'link-overload')?.severity).toBe('error');
  });

  it('uses an edge bandwidth override and has no limit for plain network links', () => {
    const doc = seraIot();
    const publish = doc.edges.find((e) => e.id === 'e-publish')!;
    expect(linkLoads(doc).find((l) => l.edgeId === 'e-publish')!.capacityKbps).toBeUndefined();
    publish.props.bandwidthKbps = 0.2;
    // 120 B × 0.2/s = 0.192 kbps: 96% of 0.2 kbps is a warning, not yet an error.
    expect(validate(doc, catalog).find((i) => i.rule === 'link-overload')?.severity).toBe(
      'warning',
    );
  });
});

describe('latency', () => {
  it('sums node latencies along the fastest path: 10 + 40 + 200 = 250 ms', () => {
    const doc = createEmptyDoc('t');
    const svc = (id: string, latencyMs: number) => ({
      id,
      domain: 'fullstack' as const,
      type: 'api',
      label: id,
      props: { latencyMs },
    });
    doc.nodes = [svc('gw', 10), svc('api', 40), svc('slow', 200), svc('slower', 900)];
    doc.edges = [
      { id: 'a', source: 'gw', target: 'api', protocol: 'HTTP', props: {} },
      { id: 'b', source: 'api', target: 'slow', protocol: 'HTTP', props: {} },
      { id: 'c', source: 'gw', target: 'slower', protocol: 'HTTP', props: {} },
      { id: 'd', source: 'slower', target: 'slow', protocol: 'HTTP', props: {} },
    ];
    expect(pathLatency(doc, 'gw', 'slow')).toEqual({
      nodeIds: ['gw', 'api', 'slow'],
      totalMs: 250,
    });
    expect(pathLatency(doc, 'gw', 'nope')).toBeUndefined();
  });
});

describe('capacity', () => {
  it('flags traffic over a node capacity', () => {
    const doc = seraIot();
    doc.nodes.find((n) => n.id === 'anomaly')!.props.capacityRps = 0.1;
    expect(nodeLoads(doc).find((l) => l.nodeId === 'anomaly')).toMatchObject({ inRps: 0.2 });
    expect(rules(doc)).toContain('node-overload');
  });
});

describe('power', () => {
  it('keeps the Sera IoT tree within the USB budget', () => {
    const [usb] = powerBudgets(seraIot(), catalog);
    // ESP32 100 + OLED 20 + BME280 0.004 via the ESP32, servo 200 direct.
    expect(usb).toMatchObject({ sourceId: 'usb', maxMa: 500 });
    expect(usb!.loadMa).toBeCloseTo(320.004);
    expect(rules(seraIot())).toEqual([]);
  });

  it('flags three 200 mA servos on a 500 mA supply', () => {
    const doc = seraIot();
    for (const id of ['s1', 's2']) {
      doc.nodes.push({ ...part(id, 'sg90') });
      doc.edges.push({
        id: `p-${id}`,
        source: 'usb',
        target: id,
        protocol: 'Power',
        pins: [
          { role: 'VCC', sourcePin: 'VBUS', targetPin: 'VCC' },
          { role: 'GND', sourcePin: 'GND', targetPin: 'GND' },
        ],
        props: {},
      });
    }
    expect(validate(doc, catalog).find((i) => i.rule === 'power-budget')).toMatchObject({
      severity: 'error',
      params: { load: 720, max: 500 },
    });
  });

  it('estimates battery life with usable capacity', () => {
    const doc = seraIot();
    const battery = part('cell', 'li-ion-18650');
    doc.nodes.push(battery);
    doc.edges.find((e) => e.id === 'p-esp')!.source = 'cell';
    doc.edges.find((e) => e.id === 'p-esp')!.pins![0]!.sourcePin = '+';
    const cell = powerBudgets(doc, catalog).find((b) => b.sourceId === 'cell')!;
    // 2600 mAh × 0.8 / 120.004 mA ≈ 17.3 h.
    expect(cell.batteryHours).toBeCloseTo(17.33, 1);
  });
});
