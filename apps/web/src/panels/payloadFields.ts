import type { Payload } from '@sysarch/shared';

type Fields = Payload['fields'];

/** One `name: type` per line, the way people sketch a message schema. */
export const formatFields = (fields: Fields) =>
  fields.map((f) => `${f.name}: ${f.type}`).join('\n');

/** Lenient inverse of formatFields: blank lines drop, a missing type becomes "string". */
export function parseFields(text: string): Fields {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(':');
      const name = (i < 0 ? line : line.slice(0, i)).trim();
      const type = i < 0 ? '' : line.slice(i + 1).trim();
      return { name, type: type || 'string' };
    })
    .filter((f) => f.name.length > 0);
}
