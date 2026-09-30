import { describe, expect, it } from 'vitest';
import { formatFields, parseFields } from './payloadFields';

describe('payload field text', () => {
  it('round-trips a field list', () => {
    const fields = [
      { name: 'deviceId', type: 'string' },
      { name: 'series', type: 'Reading[]' },
    ];
    expect(parseFields(formatFields(fields))).toEqual(fields);
  });

  it('skips blank lines and nameless entries, defaults a missing type', () => {
    expect(parseFields('\n  temp : number \n\nok\n: orphan\n')).toEqual([
      { name: 'temp', type: 'number' },
      { name: 'ok', type: 'string' },
    ]);
  });
});
