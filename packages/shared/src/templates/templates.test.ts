import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { flowTrace } from '../flows';
import { DOMAINS } from '../schema';
import { validate } from '../validate';
import { seraIot, TEMPLATES } from './index';

describe.each(TEMPLATES)('template $id', ({ build }) => {
  const doc = build();
  const catalog = effectiveCatalog(doc.customTypes);

  it('uses only catalog types', () => {
    for (const n of doc.nodes) expect(catalog.has(n.type), n.type).toBe(true);
  });

  it('maps every edge pin to a pin that exists on both ends', () => {
    const pins = new Map(doc.nodes.map((n) => [n.id, new Set((n.pins ?? []).map((p) => p.name))]));
    for (const e of doc.edges)
      for (const m of e.pins ?? []) {
        expect(pins.get(e.source)?.has(m.sourcePin), `${e.id} ${m.sourcePin}`).toBe(true);
        expect(pins.get(e.target)?.has(m.targetPin), `${e.id} ${m.targetPin}`).toBe(true);
      }
  });

  it('positions every node in the overview', () => {
    const overview = doc.views.find((v) => v.id === 'overview')!;
    for (const n of doc.nodes) expect(overview.positions[n.id], n.id).toBeDefined();
  });

  it('starts without problems: no issues above info, flows that trace end to end', () => {
    expect(
      validate(doc, catalog)
        .filter((i) => i.severity !== 'info')
        .map((i) => `${i.rule} ${i.nodeIds.join(',')}${i.edgeIds.join(',')}`),
    ).toEqual([]);
    for (const f of doc.flows) expect(flowTrace(doc, f).brokenAt, f.id).toBeUndefined();
  });

  it('returns a fresh copy on every call', () => {
    const a = build();
    a.nodes[0]!.label = 'changed';
    expect(build().nodes[0]!.label).not.toBe('changed');
  });
});

describe('Sera IoT template', () => {
  it('spans every domain', () => {
    const doc = seraIot();
    for (const d of DOMAINS)
      expect(
        doc.nodes.some((n) => n.domain === d),
        d,
      ).toBe(true);
  });
});
