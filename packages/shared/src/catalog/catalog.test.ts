import { describe, expect, it } from 'vitest';
import { CatalogTypeSchema, DOMAINS, ProtocolSchema, type CatalogType } from '../schema';
import { BUILTIN_TYPES, PROTOCOLS, defaultProps, effectiveCatalog, pinsOf } from './index';

describe('built-in catalog', () => {
  it('every type is a valid CatalogType with a unique name', () => {
    for (const t of BUILTIN_TYPES)
      expect(CatalogTypeSchema.safeParse(t).success, t.type).toBe(true);
    expect(new Set(BUILTIN_TYPES.map((t) => t.type)).size).toBe(BUILTIN_TYPES.length);
  });

  it('covers every domain', () => {
    for (const d of DOMAINS) expect(BUILTIN_TYPES.some((t) => t.domain === d)).toBe(true);
  });

  it('field defaults match their kind', () => {
    for (const t of BUILTIN_TYPES)
      for (const f of t.fields) {
        if (f.default === undefined) continue;
        const where = `${t.type}.${f.key}`;
        if (f.kind === 'number') expect(typeof f.default, where).toBe('number');
        if (f.kind === 'bool') expect(typeof f.default, where).toBe('boolean');
        if (f.kind === 'select') expect(f.options, where).toContain(f.default);
      }
  });

  it('describes every protocol, with shared roles a subset of roles', () => {
    for (const p of ProtocolSchema.options) {
      const info = PROTOCOLS[p];
      for (const r of info.sharedRoles) expect(info.roles, p).toContain(r);
    }
    expect(PROTOCOLS.SPI.sharedRoles).not.toContain('CS');
  });
});

describe('effectiveCatalog', () => {
  const lidar: CatalogType = {
    type: 'lidar',
    domain: 'hardware',
    label: 'LiDAR',
    icon: 'radar',
    fields: [{ key: 'rangeM', label: 'Menzil', kind: 'number', default: 8 }],
    protocols: ['UART'],
    pins: [{ name: 'TX', voltage: 3.3, functions: ['UART_TX'] }],
    exportHints: {},
  };

  it('adds custom types and lets them override built-ins', () => {
    const custom = { ...lidar, type: 'sensor', label: 'Özel sensör' };
    const cat = effectiveCatalog([lidar, custom]);
    expect(cat.get('lidar')?.label).toBe('LiDAR');
    expect(cat.get('sensor')?.label).toBe('Özel sensör');
    expect(cat.get('api')?.domain).toBe('fullstack');
  });

  it('pinsOf prefers node pins over type pins', () => {
    const cat = effectiveCatalog([lidar]);
    const node = { id: 'n', domain: 'hardware', type: 'lidar', label: 'L', props: {} } as const;
    expect(pinsOf(node, cat).map((p) => p.name)).toEqual(['TX']);
    const own = { ...node, pins: [{ name: 'RX', voltage: 5, functions: [] }] };
    expect(pinsOf(own, cat).map((p) => p.name)).toEqual(['RX']);
    expect(pinsOf({ ...node, type: 'unknown' }, cat)).toEqual([]);
  });

  it('defaultProps collects declared defaults', () => {
    expect(defaultProps(lidar)).toEqual({ rangeM: 8 });
  });
});
