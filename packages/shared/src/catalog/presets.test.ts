import { describe, expect, it } from 'vitest';
import { PinRoleSchema } from '../schema';
import { effectiveCatalog, PRESETS, nodeFromPreset } from './index';

const catalog = effectiveCatalog();
// Every token a pin function may end with.
const ROLES = new Set<string>(PinRoleSchema.options);

describe('hardware presets', () => {
  it('have unique ids and use known types', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(catalog.has(p.type), p.id).toBe(true);
  });

  it('only set props their type declares as fields', () => {
    for (const p of PRESETS) {
      const keys = new Set(catalog.get(p.type)!.fields.map((f) => f.key));
      for (const k of Object.keys(p.props)) expect(keys.has(k), `${p.id}.${k}`).toBe(true);
    }
  });

  it('declare unique pin names whose functions end in a known role', () => {
    for (const p of PRESETS) {
      const names = (p.pins ?? []).map((pin) => pin.name);
      expect(new Set(names).size, p.id).toBe(names.length);
      for (const pin of p.pins ?? [])
        for (const f of pin.functions)
          expect(ROLES.has(f.split('_').at(-1)!), `${p.id}.${pin.name}: ${f}`).toBe(true);
    }
  });

  it('nodeFromPreset merges type defaults with part values and copies pins', () => {
    const bme = PRESETS.find((p) => p.id === 'bme280')!;
    const node = nodeFromPreset(bme, catalog, 'n1');
    expect(node).toMatchObject({
      id: 'n1',
      domain: 'hardware',
      type: 'sensor',
      preset: 'bme280',
      label: 'BME280',
    });
    expect(node.props.i2cAddress).toBe('0x76');
    node.pins![0]!.functions.push('mutated');
    expect(bme.pins![0]!.functions).not.toContain('mutated');
  });
});
