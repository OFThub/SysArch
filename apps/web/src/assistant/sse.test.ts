import { describe, expect, it } from 'vitest';
import { sseParser } from './sse';

describe('sseParser', () => {
  it('assembles events split across chunks and skips comments', () => {
    const feed = sseParser();
    expect(feed(': connected\n\nevent: text\nda')).toEqual([]);
    expect(feed('ta: "Mer"\n\nevent: text\ndata: "haba"\n\nevent: done\n')).toEqual([
      { event: 'text', data: '"Mer"' },
      { event: 'text', data: '"haba"' },
    ]);
    expect(feed('data: {"ok":true}\n\n')).toEqual([{ event: 'done', data: '{"ok":true}' }]);
  });

  it('joins multi-line data and handles CRLF', () => {
    expect(sseParser()('data: a\r\ndata: b\r\n\r\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});
