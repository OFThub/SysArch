import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { DOMAINS } from '../schema';
import { seraIot } from './index';

describe('Sera IoT template', () => {
  const doc = seraIot();
  const catalog = effectiveCatalog(doc.customTypes);

  it('uses only catalog types and spans every domain', () => {
    for (const n of doc.nodes) expect(catalog.has(n.type), n.type).toBe(true);
    for (const d of DOMAINS)
      expect(
        doc.nodes.some((n) => n.domain === d),
        d,
      ).toBe(true);
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

  it('returns a fresh copy on every call', () => {
    const a = seraIot();
    a.nodes[0]!.label = 'changed';
    expect(seraIot().nodes[0]!.label).not.toBe('changed');
  });
});
