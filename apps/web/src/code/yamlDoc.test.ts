import { seraIot } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { fromYaml, toYaml } from './yamlDoc';

const doc = seraIot();
const read = (text: string) => fromYaml(text, doc);
const parsed = (text: string) => {
  const r = read(text);
  if ('errors' in r) throw new Error(JSON.stringify(r.errors));
  return r.doc;
};
const errors = (text: string) => {
  const r = read(text);
  if (!('errors' in r)) throw new Error('expected errors');
  return r.errors;
};
const lineOf = (text: string, needle: string) =>
  text.split('\n').findIndex((l) => l.includes(needle)) + 1;

describe('code editor YAML', () => {
  it('round-trips the doc and leaves the layout out of the text', () => {
    const text = toYaml(doc);
    expect(text).not.toContain('positions');
    expect(parsed(text)).toEqual(doc);
  });

  it('applies an edit and keeps the layout', () => {
    const next = parsed(toYaml(doc).replace('label: Sera API', 'label: Sera servisi'));
    expect(next.nodes.find((n) => n.id === 'api')?.label).toBe('Sera servisi');
    expect(next.views).toEqual(doc.views);
  });

  it('drops the layout of a node removed in the text', () => {
    const nodes = doc.nodes.filter((n) => n.id !== 'dashboard');
    const edges = doc.edges.filter((e) => e.target !== 'dashboard' && e.source !== 'dashboard');
    const next = parsed(toYaml({ ...doc, nodes, edges }));
    expect(next.views.some((v) => 'dashboard' in v.positions)).toBe(false);
    expect(next.views.some((v) => 'api' in v.positions)).toBe(true);
  });

  it('points a syntax error at its line', () => {
    const text = toYaml(doc).replace('label: Sera API', 'label: "Sera API');
    expect(errors(text)[0]!.line).toBeGreaterThanOrEqual(lineOf(text, '"Sera API'));
  });

  it('points a dangling reference at its line, in Turkish', () => {
    const text = toYaml(doc).replace('source: api', 'source: yok');
    expect(errors(text)).toEqual([
      { line: lineOf(text, 'source: yok'), col: 13, message: '"yok" kimlikli bir bileşen yok.' },
    ]);
  });

  it('reports a wrong value type at the field, in Turkish', () => {
    const text = toYaml(doc).replace('label: Sera API', 'label: 42');
    const [e] = errors(text);
    expect(e!.line).toBe(lineOf(text, 'label: 42'));
    expect(e!.message).toMatch(/beklenen string/);
  });

  it('rejects text that is not a map', () => {
    expect(errors('- a\n- b\n')).toEqual([{ line: 1, col: 1, message: expect.any(String) }]);
  });
});
