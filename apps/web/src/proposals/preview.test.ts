import { applyOps, effectiveCatalog, seraIot, type Op } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { describeOp, previewOps } from './preview';

const catalog = effectiveCatalog();
const ops: Op[] = [
  {
    op: 'add_node',
    node: { id: 'cache', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} },
  },
  {
    op: 'add_edge',
    edge: { id: 'e-cache', source: 'api', target: 'cache', protocol: 'TCP', props: {} },
  },
  { op: 'update_node', id: 'api', patch: { label: 'Sera API v2', props: { port: 8080 } } },
  { op: 'remove_node', id: 'dashboard' },
];

describe('previewOps', () => {
  it('marks every change and keeps removals on the canvas where they stood', () => {
    const doc = seraIot();
    const p = previewOps(doc, ops);

    expect(p.errors).toEqual([]);
    expect(Object.fromEntries(p.nodes)).toEqual({
      cache: 'added',
      api: 'changed',
      dashboard: 'removed',
    });
    expect(p.edges.get('e-cache')).toBe('added');
    // The dashboard's link goes with it, and both are still drawn, as ghosts.
    const gone = doc.edges.filter((e) => [e.source, e.target].includes('dashboard'));
    expect(gone.length).toBeGreaterThan(0);
    for (const e of gone) expect(p.edges.get(e.id)).toBe('removed');
    expect(p.doc.nodes.some((n) => n.id === 'dashboard')).toBe(true);
    expect(p.doc.views.find((v) => v.id === 'fullstack')!.positions.dashboard).toEqual({
      x: 0,
      y: 220,
    });
    // Untouched parts carry no mark.
    expect(p.nodes.has('esp32')).toBe(false);
  });

  it('reports ops that no longer apply', () => {
    const p = previewOps(seraIot(), [{ op: 'remove_node', id: 'ghost' }]);
    expect(p.errors).toEqual([{ index: 0, message: 'unknown node "ghost"' }]);
    expect(p.nodes.size).toBe(0);
  });
});

describe('describeOp', () => {
  it('says what each op does in UI words, naming parts by label', () => {
    const before = seraIot();
    const after = applyOps(before, ops).doc;
    expect(ops.map((op) => describeOp(op, before, after, catalog))).toEqual([
      '“Redis” ekle (Önbellek)',
      'Sera API ile Redis arasına TCP bağlantısı ekle',
      '“Sera API” için etiket, port değiştir',
      '“Panel” bileşenini sil',
    ]);
  });
});
