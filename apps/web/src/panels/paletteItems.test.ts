import { effectiveCatalog } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { createNode, paletteSections } from './paletteItems';

const catalog = effectiveCatalog();

describe('paletteSections', () => {
  it('shows only the active domain in a domain tab and every domain in the overview', () => {
    expect(paletteSections(catalog, 'ai', '').map((s) => s.domain)).toEqual(['ai']);
    expect(paletteSections(catalog, undefined, '').map((s) => s.domain)).toEqual([
      'fullstack',
      'ai',
      'hardware',
    ]);
  });

  it('lists hardware presets under their domain', () => {
    const [hw] = paletteSections(catalog, 'hardware', '');
    expect(hw!.presets.map((p) => p.label)).toContain('ESP32-S3');
    expect(paletteSections(catalog, 'fullstack', '')[0]!.presets).toEqual([]);
  });

  it('matches queries with Turkish casing across labels and type names', () => {
    const hits = paletteSections(catalog, undefined, 'VERİTABANI').flatMap((s) => s.types);
    expect(hits.map((t) => t.id).sort()).toEqual(['database', 'vector_db']);
    const presets = paletteSections(catalog, undefined, 'bme').flatMap((s) => s.presets);
    expect(presets.map((p) => p.id)).toEqual(['bme280']);
  });

  it('drops empty sections', () => {
    expect(paletteSections(catalog, undefined, 'no-such-part')).toEqual([]);
  });
});

describe('createNode', () => {
  it('builds a node from a generic type with its defaults', () => {
    const n = createNode({ kind: 'type', id: 'api' }, catalog);
    expect(n).toMatchObject({ domain: 'fullstack', type: 'api', label: 'API servisi' });
    expect(n.props.port).toBe(3000);
  });

  it('builds a node from a preset with its pins and a fresh id each time', () => {
    const a = createNode({ kind: 'preset', id: 'bme280' }, catalog);
    const b = createNode({ kind: 'preset', id: 'bme280' }, catalog);
    expect(a.pins?.map((p) => p.name)).toContain('SDA');
    expect(a.id).not.toBe(b.id);
  });
});
