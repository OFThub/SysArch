import { seraIot } from '@sysarch/shared';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../test/harness';

async function setup() {
  const h = await createHarness();
  const ada = await h.signIn('ada@example.test');
  const bob = await h.signIn('bob@example.test');
  const call = (who: { headers: Headers }, path: string, init: RequestInit = {}) => {
    const headers = new Headers(who.headers);
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (init.body) headers.set('content-type', 'application/json');
    return h.app.request(`/api/projects${path}`, { ...init, headers });
  };
  const created = await call(ada, '', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sera', doc: seraIot() }),
  });
  const project = (await created.json()) as { id: string; doc: ReturnType<typeof seraIot> };
  return { ...h, ada, bob, call, project };
}

/** Reads the SSE body until `pattern` shows up; returns everything read. */
function reader(res: Response) {
  const stream = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  return {
    async until(pattern: RegExp) {
      while (!pattern.test(text)) {
        const { value, done } = await stream.read();
        if (done) throw new Error(`stream ended before ${pattern}`);
        text += decoder.decode(value);
      }
      return text;
    },
    cancel: () => stream.cancel(),
  };
}

describe('project events', () => {
  it('needs a session and the project owner', async () => {
    const { app, bob, call, project } = await setup();
    expect((await app.request(`/api/projects/${project.id}/events`)).status).toBe(401);
    expect((await call(bob, `/${project.id}/events`)).status).toBe(404);
  });

  it('streams saves with the saving tab id, and proposal changes', async () => {
    const { ada, call, project, events } = await setup();
    const res = await call(ada, `/${project.id}/events`);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const sse = reader(res);
    await sse.until(/: connected/);

    await call(ada, `/${project.id}`, {
      method: 'PUT',
      headers: { 'if-match': '"1"', 'x-client-id': 'tab-1' },
      body: JSON.stringify({ doc: project.doc }),
    });
    const saved = await sse.until(/event: doc\.updated/);
    expect(saved).toContain('"revision":2');
    // The saving tab recognises its own echo by this id.
    expect(saved).toContain('"origin":"tab-1"');

    await call(ada, `/${project.id}/proposals`, {
      method: 'POST',
      body: JSON.stringify({
        summary: 'x',
        ops: [{ op: 'update_node', id: 'api', patch: { label: 'API' } }],
      }),
    });
    await sse.until(/event: proposal\.changed/);

    // A closed stream leaves no listener behind.
    await sse.cancel();
    await vi.waitFor(() => expect(events.listenerCount(project.id)).toBe(0));
  });
});
