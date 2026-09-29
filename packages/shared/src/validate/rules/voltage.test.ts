import { describe, expect, it } from 'vitest';
import { effectiveCatalog, nodeFromPreset, PRESETS } from '../../catalog';
import { seraIot } from '../../templates';
import { ruleContext } from '../engine';
import { validate } from '../index';
import { voltageMismatches } from './voltage';

const catalog = effectiveCatalog();
const check = (doc: ReturnType<typeof seraIot>, tolerance = 0.3) =>
  voltageMismatches(ruleContext(doc, catalog), tolerance);
const part = (id: string, preset: string) =>
  nodeFromPreset(
    PRESETS.find((p) => p.id === preset)!,
    catalog,
    id,
  );

describe('pin voltage rule', () => {
  it('passes the Sera IoT design, where every mapping matches', () => {
    expect(check(seraIot())).toEqual([]);
  });

  it("catches an HC-SR04's 5 V ECHO on an ESP32 3.3 V GPIO", () => {
    const doc = seraIot();
    doc.nodes.push(part('sonar', 'hc-sr04'));
    doc.edges.push({
      id: 'e-sonar',
      source: 'esp32',
      target: 'sonar',
      protocol: 'GPIO',
      pins: [{ role: 'GPIO', sourcePin: 'GPIO5', targetPin: 'ECHO' }],
      props: {},
    });
    const [finding, ...rest] = check(doc);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      nodeIds: ['esp32', 'sonar'],
      edgeIds: ['e-sonar'],
      params: { sourcePin: 'GPIO5', targetPin: 'ECHO', sourceV: 3.3, targetV: 5 },
    });
    // Signal lines are warnings: whether 5 V reaches the GPIO depends on who drives the line.
    expect(finding!.severity).toBe('warning');
  });

  it('catches a 5 V rail on a 3.3 V supply pin', () => {
    const doc = seraIot();
    doc.edges.find((e) => e.id === 'p-esp')!.pins![0]!.targetPin = '3V3';
    const findings = check(doc);
    expect(findings.map((f) => f.params.targetPin)).toEqual(['3V3']);
    // A wrong supply rail always damages or starves the part.
    expect(findings[0]!.severity).toBe('error');
  });

  it('allows differences within the tolerance', () => {
    const doc = seraIot();
    doc.nodes.find((n) => n.id === 'bme280')!.pins!.find((p) => p.name === 'SDA')!.voltage = 3.5;
    expect(check(doc, 0.3)).toEqual([]);
    expect(check(doc, 0.1)).toHaveLength(1);
  });

  it('skips mappings to pins a part does not list', () => {
    const doc = seraIot();
    doc.edges.find((e) => e.id === 'e-bme')!.pins![0]!.targetPin = 'NOPE';
    expect(check(doc)).toEqual([]);
  });
});

describe('pin voltage issues', () => {
  it('gets one distinct issue per mismatched role on the same edge', () => {
    const doc = seraIot();
    const bme = doc.nodes.find((n) => n.id === 'bme280')!;
    for (const p of bme.pins!) if (p.name === 'SDA' || p.name === 'SCL') p.voltage = 5;
    const issues = validate(doc, catalog).filter((i) => i.rule === 'pin-voltage');
    expect(issues.map((i) => i.params.role)).toEqual(['SDA', 'SCL']);
    expect(new Set(issues.map((i) => i.id)).size).toBe(2);
  });
});
