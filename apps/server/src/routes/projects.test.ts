import { createEmptyDoc, seraIot, SCHEMA_VERSION } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { schema } from '../db';
import { createHarness } from '../test/harness';

type Doc = ReturnType<typeof seraIot>;
type List = { projects: { id: string; name: string }[] };
/** Response bodies are unknown to TypeScript; each call site names the shape it expects. */
const json = <T>(res: Response) => res.json() as Promise<T>;

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
  const create = async (who: typeof ada, body: object = { name: 'Sera' }) => {
    const res = await call(who, '', { method: 'POST', body: JSON.stringify(body) });
    return json<{ id: string; revision: number; doc: Doc }>(res);
  };
  return { ...h, ada, bob, call, create };
}

describe('projects api', () => {
  it('requires a session', async () => {
    const { app } = await createHarness();
    expect((await app.request('/api/projects')).status).toBe(401);
  });

  it('creates, lists and reads a project', async () => {
    const { ada, call, create } = await setup();
    const p = await create(ada);
    expect(p.revision).toBe(1);
    expect(p.doc.meta.name).toBe('Sera');

    const list = await json<List>(await call(ada, ''));
    expect(list.projects.map((x: { id: string }) => x.id)).toEqual([p.id]);

    const res = await call(ada, `/${p.id}`);
    expect(res.headers.get('etag')).toBe('"1"');
    expect((await json<{ doc: Doc }>(res)).doc.version).toBe(SCHEMA_VERSION);
  });

  it('creates from a template doc and renames it to the given name', async () => {
    const { ada, create } = await setup();
    const p = await create(ada, { name: 'My greenhouse', doc: seraIot() });
    expect(p.doc.nodes.length).toBe(seraIot().nodes.length);
    expect(p.doc.meta.name).toBe('My greenhouse');
  });

  it("hides another user's project behind 404 for every method", async () => {
    const { ada, bob, call, create } = await setup();
    const p = await create(ada);
    expect((await call(bob, `/${p.id}`)).status).toBe(404);
    const put = await call(bob, `/${p.id}`, {
      method: 'PUT',
      headers: { 'if-match': '"1"' },
      body: JSON.stringify({ doc: p.doc }),
    });
    expect(put.status).toBe(404);
    expect((await call(bob, `/${p.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await json<List>(await call(bob, ''))).projects).toEqual([]);
    // Ada's project survived Bob's attempts.
    expect((await call(ada, `/${p.id}`)).status).toBe(200);
  });

  it('saves with the current revision and rejects a stale one with 409', async () => {
    const { ada, call, create } = await setup();
    const p = await create(ada);
    const doc = { ...p.doc, meta: { ...p.doc.meta, name: 'Renamed' } };
    const save = (rev: string) =>
      call(ada, `/${p.id}`, {
        method: 'PUT',
        headers: { 'if-match': rev },
        body: JSON.stringify({ doc }),
      });

    const ok = await save('"1"');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ revision: 2 });
    expect(ok.headers.get('etag')).toBe('"2"');

    const stale = await save('"1"');
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'revision_conflict', revision: 2 });

    const list = await json<List>(await call(ada, ''));
    expect(list.projects[0]!.name).toBe('Renamed');
  });

  it('requires If-Match on save', async () => {
    const { ada, call, create } = await setup();
    const p = await create(ada);
    const res = await call(ada, `/${p.id}`, {
      method: 'PUT',
      body: JSON.stringify({ doc: p.doc }),
    });
    expect(res.status).toBe(428);
  });

  it('rejects a doc that breaks referential integrity', async () => {
    const { ada, call, create } = await setup();
    const p = await create(ada);
    const doc = createEmptyDoc('x');
    doc.edges.push({ id: 'e', source: 'a', target: 'b', protocol: 'HTTP', props: {} });
    const res = await call(ada, `/${p.id}`, {
      method: 'PUT',
      headers: { 'if-match': '"1"' },
      body: JSON.stringify({ doc }),
    });
    expect(res.status).toBe(400);
    expect((await json<{ issues: string[] }>(res)).issues).toContain(
      'doc.edges.0.source: unknown node "a"',
    );
  });

  it('rejects bodies over the size limit with 413', async () => {
    const { ada, call } = await setup();
    const res = await call(ada, '', {
      method: 'POST',
      body: JSON.stringify({ name: 'big', doc: { padding: 'x'.repeat(3 * 1024 * 1024) } }),
    });
    expect(res.status).toBe(413);
  });

  it('migrates a stored doc on read', async () => {
    const { ada, db, call } = await setup();
    // A doc as an older client stored it: no flows, boundaries or custom types yet.
    const { flows: _f, boundaries: _b, customTypes: _c, ...old } = createEmptyDoc('Old');
    db.insert(schema.projects)
      .values({ id: 'old1', ownerId: ada.user.id, name: 'Old', doc: old })
      .run();
    const { doc } = await json<{ doc: Doc }>(await call(ada, '/old1'));
    expect(doc.flows).toEqual([]);
    expect(doc.customTypes).toEqual([]);
  });

  it('deletes a project', async () => {
    const { ada, call, create } = await setup();
    const p = await create(ada);
    expect((await call(ada, `/${p.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(ada, `/${p.id}`)).status).toBe(404);
  });
});
