export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Incremental server-sent events parser for a fetch body (EventSource can
 * only GET). Feed it decoded chunks; it returns the complete events so far
 * and keeps a partial one for the next chunk. Comment lines are skipped.
 */
export function sseParser() {
  let buffer = '';
  return (chunk: string): SseEvent[] => {
    buffer += chunk.replaceAll('\r\n', '\n');
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    return blocks.flatMap((block) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      return data.length ? [{ event, data: data.join('\n') }] : [];
    });
  };
}
