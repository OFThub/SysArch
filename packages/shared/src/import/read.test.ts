import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { readSource } from './read';

const catalog = effectiveCatalog();
const format = (text: string) => readSource(text, catalog).format;

describe('reading any source', () => {
  it('tells the formats apart by content', () => {
    expect(format('services:\n  db:\n    image: postgres\n')).toBe('compose');
    expect(format('flowchart LR\n  a --> b')).toBe('mermaid');
    expect(format('%% top\ngraph TD\n  a --> b')).toBe('mermaid');
    expect(format('{"parts": [{"id": "led1", "type": "wokwi-led"}]}')).toBe('wokwi');
  });

  it('finds a flowchart inside a README', () => {
    const md = '# Sistem\n\nAçıklama.\n\n```mermaid\nflowchart LR\n  web --> api\n```\n';
    expect(readSource(md, catalog).nodes.map((n) => n.id)).toEqual(['web', 'api']);
  });

  it('says when there is nothing to read', () => {
    expect(() => readSource('  \n', catalog)).toThrow(expect.objectContaining({ code: 'empty' }));
    expect(() => readSource('just: yaml', catalog)).toThrow(
      expect.objectContaining({ code: 'format' }),
    );
  });
});
