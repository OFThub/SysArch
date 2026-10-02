import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from './catalog';
import { architectureMarkdown } from './export';
import { chainEdges, flowTrace } from './flows';
import { seraIot } from './templates';
import { validate } from './validate';

const catalog = effectiveCatalog();
// Sensor reading to database: the subscribe link points from the API to the
// broker, so the flow travels it backwards.
const telemetry = {
  id: 'telemetry',
  name: 'Telemetri',
  steps: ['e-publish', 'e-subscribe', 'e-store'],
};
const latency = (doc: ReturnType<typeof seraIot>, id: string) =>
  Number(doc.nodes.find((n) => n.id === id)!.props.latencyMs ?? 0);

describe('flowTrace', () => {
  it('walks the steps either way round and adds up latency along them', () => {
    const doc = seraIot();
    const trace = flowTrace(doc, telemetry);
    expect(trace.nodeIds).toEqual(['esp32', 'mqtt', 'api', 'db']);
    expect(trace.brokenAt).toBeUndefined();
    const expected = ['esp32', 'mqtt', 'api', 'db'].reduce((sum, id) => sum + latency(doc, id), 0);
    expect(trace.totalMs).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('stops where a step does not continue from the last one', () => {
    const trace = flowTrace(seraIot(), { ...telemetry, steps: ['e-publish', 'e-store'] });
    expect(trace).toMatchObject({ nodeIds: ['esp32', 'mqtt'], brokenAt: 1 });
  });
});

describe('chainEdges', () => {
  it('orders a selection that forms one path, starting where data leaves', () => {
    expect(chainEdges(seraIot(), ['e-store', 'e-publish', 'e-subscribe'])).toEqual([
      'e-publish',
      'e-subscribe',
      'e-store',
    ]);
  });

  it('refuses branches and gaps', () => {
    // Three links meet at the API: not one path.
    expect(chainEdges(seraIot(), ['e-store', 'e-dashboard', 'e-score'])).toBeNull();
    expect(chainEdges(seraIot(), ['e-publish', 'e-store'])).toBeNull();
    expect(chainEdges(seraIot(), [])).toBeNull();
  });
});

describe('flow rules', () => {
  it('warns when a flow misses its target time, and only then', () => {
    const doc = seraIot();
    const total = flowTrace(doc, telemetry).totalMs;
    doc.flows.push({ ...telemetry, slaMs: total - 1 });
    const issue = validate(doc, catalog).find((i) => i.rule === 'flow-sla')!;
    expect(issue).toMatchObject({ severity: 'warning', params: { slaMs: total - 1 } });

    doc.flows[0]!.slaMs = total;
    expect(validate(doc, catalog).some((i) => i.rule === 'flow-sla')).toBe(false);
  });

  it('reports the step where a flow breaks', () => {
    const doc = seraIot();
    doc.flows.push({ ...telemetry, steps: ['e-publish', 'e-store'] });
    const issue = validate(doc, catalog).find((i) => i.rule === 'flow-broken')!;
    expect(issue).toMatchObject({ edgeIds: ['e-store'], params: { name: 'Telemetri', step: 2 } });
  });
});

describe('flows in ARCHITECTURE.md', () => {
  it('draws each flow as a sequence in the direction it is travelled', () => {
    const doc = seraIot();
    doc.flows.push({ ...telemetry, slaMs: 500 });
    const md = architectureMarkdown(doc, catalog, 'en');
    expect(md).toContain('## Flows');
    expect(md).toContain('sequenceDiagram');
    expect(md).toMatch(/n_esp32->>n_mqtt: MQTT/);
    // e-subscribe points api -> mqtt; the flow goes mqtt -> api.
    expect(md).toMatch(/n_mqtt->>n_api: MQTT/);
    expect(md).toContain('(target 500 ms)');
  });
});
