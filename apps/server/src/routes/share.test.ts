import { seraIot, type ArchDoc } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { createHarness } from '../test/harness';

const json = <T>(res: Response) => res.json() as Promise<T>;

describe('share links', () => {
  it('lets the owner make, keep and revoke a link anyone can read', async () => {
    const h = await createHarness();
    const ada = await h.signIn('ada@example.test');
    const bob = await h.signIn('bob@example.test');
    const call = (who: { headers: Headers } | null, path: string, method = 'GET') =>
      h.app.request(`/api${path}`, { method, headers: who ? new Headers(who.headers) : undefined });
    const created = await h.app.request('/api/projects', {
      method: 'POST',
      headers: { ...Object.fromEntries(ada.headers), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sera', doc: seraIot() }),
    });
    const { id } = await json<{ id: string }>(created);
    const share = `/projects/${id}/share`;

    expect(await json(await call(ada, share))).toEqual({ token: null });
    const made = await call(ada, share, 'POST');
    expect(made.status).toBe(201);
    const { token } = await json<{ token: string }>(made);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Sharing again keeps the same link.
    expect(await json(await call(ada, share, 'POST'))).toEqual({ token });

    // Read without any session; nothing but the design comes back.
    const read = await call(null, `/share/${token}`);
    expect(read.status).toBe(200);
    expect(read.headers.get('Cache-Control')).toContain('no-store');
    const body = await json<{ name: string; doc: ArchDoc }>(read);
    expect(Object.keys(body).sort()).toEqual(['doc', 'name']);
    expect(body.doc.nodes.length).toBe(seraIot().nodes.length);

    // Only the owner manages it; guesses and malformed tokens look missing.
    expect((await call(bob, share)).status).toBe(404);
    expect((await call(bob, share, 'POST')).status).toBe(404);
    expect((await call(bob, share, 'DELETE')).status).toBe(404);
    expect((await call(null, share, 'POST')).status).toBe(401);
    expect((await call(null, `/share/${'a'.repeat(43)}`)).status).toBe(404);
    expect((await call(null, '/share/not-a-token')).status).toBe(404);

    expect((await call(ada, share, 'DELETE')).status).toBe(204);
    expect((await call(null, `/share/${token}`)).status).toBe(404);
    const again = await json<{ token: string }>(await call(ada, share, 'POST'));
    expect(again.token).not.toBe(token);
  });
});
