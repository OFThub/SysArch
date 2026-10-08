import { removeElements, seraIot, type ArchDoc } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { createHarness } from '../test/harness';
import type { Proposal } from './proposals';

const json = <T>(res: Response) => res.json() as Promise<T>;
type Snap = { id: string; name: string; revision: number };

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
  const post = (who: typeof ada, path: string, body: object) =>
    call(who, path, { method: 'POST', body: JSON.stringify(body) });
  const project = await json<{ id: string }>(await post(ada, '', { name: 'Sera', doc: seraIot() }));
  const base = `/${project.id}/snapshots`;
  return { ada, bob, call, post, project, base };
}

describe('snapshots api', () => {
  it('saves the stored doc under a name and keeps it from other users', async () => {
    const { ada, bob, call, post, base } = await setup();
    const res = await post(ada, base, { name: 'İlk sürüm' });
    expect(res.status).toBe(201);
    const { snapshot } = await json<{ snapshot: Snap }>(res);
    expect(snapshot).toMatchObject({ name: 'İlk sürüm', revision: 1 });

    const list = await json<{ snapshots: Snap[] }>(await call(ada, base));
    expect(list.snapshots.map((s) => s.id)).toEqual([snapshot.id]);
    const full = await json<{ snapshot: { doc: ArchDoc } }>(
      await call(ada, `${base}/${snapshot.id}`),
    );
    expect(full.snapshot.doc.nodes.some((n) => n.id === 'llm')).toBe(true);

    // Someone else's project looks missing, whatever they try.
    expect((await call(bob, base)).status).toBe(404);
    expect((await post(bob, base, { name: 'x' })).status).toBe(404);
    expect((await call(bob, `${base}/${snapshot.id}`)).status).toBe(404);
    expect((await post(bob, `${base}/${snapshot.id}/fork`, { name: 'x' })).status).toBe(404);
    expect((await post(ada, base, { name: '' })).status).toBe(400);
  });

  it('restores through a proposal of the differences, or reports none', async () => {
    const { ada, call, post, project, base } = await setup();
    const { snapshot } = await json<{ snapshot: Snap }>(await post(ada, base, { name: 'v1' }));

    const changed = removeElements(seraIot(), ['llm'], []);
    changed.nodes.find((n) => n.id === 'api')!.label = 'Sera servisi';
    const saved = await call(ada, `/${project.id}`, {
      method: 'PUT',
      headers: { 'If-Match': '"1"' },
      body: JSON.stringify({ doc: changed }),
    });
    expect(saved.status).toBe(200);

    const res = await post(ada, `${base}/${snapshot.id}/restore`, { summary: 'v1 sürümüne dön' });
    expect(res.status).toBe(201);
    const { proposal } = await json<{ proposal: Proposal }>(res);
    expect(proposal).toMatchObject({
      source: 'snapshot',
      summary: 'v1 sürümüne dön',
      baseRevision: 2,
    });
    expect(proposal.ops.map((o) => o.op).sort()).toEqual(['add_edge', 'add_node', 'update_node']);

    const { snapshot: now } = await json<{ snapshot: Snap }>(await post(ada, base, { name: 'v2' }));
    const same = await post(ada, `${base}/${now.id}/restore`, { summary: 'v2' });
    expect(await json(same)).toEqual({ proposal: null });
  });

  it('forks a snapshot into a new project and deletes it', async () => {
    const { ada, call, post, base } = await setup();
    const { snapshot } = await json<{ snapshot: Snap }>(await post(ada, base, { name: 'v1' }));

    const fork = await post(ada, `${base}/${snapshot.id}/fork`, { name: 'Sera deneme' });
    expect(fork.status).toBe(201);
    const { id } = await json<{ id: string }>(fork);
    const copy = await json<{ name: string; doc: ArchDoc }>(await call(ada, `/${id}`));
    expect(copy.name).toBe('Sera deneme');
    expect(copy.doc.meta.name).toBe('Sera deneme');
    expect(copy.doc.nodes.length).toBe(seraIot().nodes.length);

    expect((await call(ada, `${base}/${snapshot.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(ada, `${base}/${snapshot.id}`)).status).toBe(404);
  });
});
