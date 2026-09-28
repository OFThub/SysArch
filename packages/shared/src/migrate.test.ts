import { describe, expect, it } from 'vitest';
import { migrate, upgrade, type Migration } from './migrate';
import { createEmptyDoc, SCHEMA_VERSION } from './schema';

describe('upgrade', () => {
  const steps: Record<number, Migration> = {
    1: (d) => ({ ...d, flows: [] }),
    2: (d) => ({ ...d, renamed: d.flows, flows: undefined }),
  };

  it('applies every step in order and stamps the target version', () => {
    expect(upgrade({ version: 1, nodes: [] }, steps, 3)).toEqual({
      version: 3,
      nodes: [],
      renamed: [],
      flows: undefined,
    });
  });

  it('treats a doc without a version as v1', () => {
    expect(upgrade({}, steps, 2)).toEqual({ version: 2, flows: [] });
  });

  it('rejects docs from a newer app version', () => {
    expect(() => upgrade({ version: 9 }, steps, 3)).toThrow('newer than supported');
  });

  it('fails loudly when a step is missing', () => {
    expect(() => upgrade({ version: 1 }, { 2: steps[2]! }, 3)).toThrow(
      'no migration from version 1',
    );
  });

  it('rejects non-object input', () => {
    expect(() => upgrade([], steps, 1)).toThrow('must be a JSON object');
  });
});

describe('migrate', () => {
  it('returns a current doc validated with defaults filled', () => {
    const { flows: _f, boundaries: _b, customTypes: _c, ...stored } = createEmptyDoc('old');
    const doc = migrate(stored);
    expect(doc.version).toBe(SCHEMA_VERSION);
    expect(doc.flows).toEqual([]);
    expect(doc.customTypes).toEqual([]);
  });

  it('throws on a structurally invalid doc', () => {
    expect(() => migrate({ version: SCHEMA_VERSION, meta: {} })).toThrow();
  });
});
