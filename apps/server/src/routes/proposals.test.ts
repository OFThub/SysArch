import { removeElements, seraIot, type Op } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { createHarness } from '../test/harness';
import type { Proposal } from './proposals';

type Doc = ReturnType<typeof seraIot>;
const json = <T>(res: Response) => res.json() as Promise<T>;

const cacheNode: Op = {
  op: 'add_node',
  node: { id: 'cache', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} },
};
const cacheEdge: Op = {
  op: 'add_edge',
  edge: { id: 'e-cache', source: 'api', target: 'cache', protocol: 'TCP', props: {} },
};

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

  const created = await post(ada, '', { name: 'Sera', doc: seraIot() });
  const project = await json<{ id: string; revision: number; doc: Doc }>(created);
  const base = `/${project.id}/proposals`;
  const propose = async (ops: Op[], who = ada) => {
    const res = await post(who, base, { summary: 'Önbellek ekle', ops });
    return { res, body: await json<{ proposal: Proposal }>(res) };
  };
  const pending = async (who = ada) =>
    (await json<{ proposals: Proposal[] }>(await call(who, base))).proposals;
  const read = async () => json<{ revision: number; doc: Doc }>(await call(ada, `/${project.id}`));

  return { ...h, ada, bob, call, post, project, base, propose, pending, read };
}

describe('proposals api', () => {
  it('requires a session', async () => {
    const { app } = await createHarness();
    expect((await app.request('/api/projects/x/proposals')).status).toBe(401);
  });

  it('stores a dry-run proposal without touching the doc and lists what it would break', async () => {
    const { propose, pending, read } = await setup();
    const { res, body } = await propose([cacheNode]);

    expect(res.status).toBe(201);
    expect(body.proposal).toMatchObject({ source: 'mcp', status: 'pending', baseRevision: 1 });
    // An unconnected cache is an orphan: the preview has to say so.
    expect(body.proposal.newIssues.map((i) => i.rule)).toEqual(['orphan-node']);
    expect((await pending()).map((p) => p.id)).toEqual([body.proposal.id]);
    expect((await read()).revision).toBe(1);
  });

  it('refuses ops that do not apply, with a reason per op, and stores nothing', async () => {
    const { propose, pending, post, ada, base } = await setup();
    const { res, body } = await propose([cacheEdge]);

    expect(res.status).toBe(422);
    expect(body).toMatchObject({ error: 'invalid_ops', errors: [{ index: 0 }] });
    expect(JSON.stringify(body)).toMatch(/unknown node \\"cache\\"/);
    expect(await pending()).toEqual([]);
    // Not an op at all: rejected by the schema before any dry run.
    const bad = await post(ada, base, { summary: 'x', ops: [{ op: 'drop_table' }] });
    expect(bad.status).toBe(400);
  });

  it('applies every op as one new revision and closes the proposal', async () => {
    const { propose, post, ada, base, pending, read } = await setup();
    const { body } = await propose([cacheNode, cacheEdge]);

    const res = await post(ada, `${base}/${body.proposal.id}/apply`, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"2"');
    const saved = await read();
    expect(saved.revision).toBe(2);
    expect(saved.doc.edges.some((e) => e.id === 'e-cache')).toBe(true);
    expect(await pending()).toEqual([]);

    const again = await post(ada, `${base}/${body.proposal.id}/apply`, {});
    expect(again.status).toBe(409);
    expect(await json(again)).toEqual({ error: 'not_pending', status: 'applied' });
  });

  it('applies only the accepted ops and names a missing dependency by its index', async () => {
    const { propose, post, ada, base, read } = await setup();
    const { body } = await propose([cacheNode, cacheEdge]);
    const apply = (accept: number[]) => post(ada, `${base}/${body.proposal.id}/apply`, { accept });

    // The edge alone points at a node the user left out.
    const conflict = await apply([1]);
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toMatchObject({ error: 'ops_conflict', errors: [{ index: 1 }] });
    expect((await read()).revision).toBe(1);

    expect((await apply([0])).status).toBe(200);
    const saved = await read();
    expect(saved.doc.nodes.some((n) => n.id === 'cache')).toBe(true);
    expect(saved.doc.edges.some((e) => e.id === 'e-cache')).toBe(false);
  });

  it('replays on the current doc and reports ops an edit in between made impossible', async () => {
    const { propose, post, call, ada, base, project, read } = await setup();
    const { body } = await propose([
      { op: 'update_node', id: 'dashboard', patch: { label: 'Yeni panel' } },
    ]);
    // The owner deletes the dashboard after the proposal was made.
    const edited = removeElements(project.doc, ['dashboard'], []);
    await call(ada, `/${project.id}`, {
      method: 'PUT',
      headers: { 'if-match': '"1"' },
      body: JSON.stringify({ doc: edited }),
    });

    const res = await post(ada, `${base}/${body.proposal.id}/apply`, {});
    expect(res.status).toBe(409);
    expect(JSON.stringify(await json(res))).toMatch(/unknown node \\"dashboard\\"/);
    expect((await read()).revision).toBe(2);
  });

  it('rejects a proposal, which then cannot be applied', async () => {
    const { propose, post, ada, base, pending } = await setup();
    const { body } = await propose([cacheNode]);
    const reject = await post(ada, `${base}/${body.proposal.id}/reject`, {});
    expect(reject.status).toBe(204);
    expect(await pending()).toEqual([]);
    expect((await post(ada, `${base}/${body.proposal.id}/apply`, {})).status).toBe(409);
  });

  it("keeps another user's proposals out of reach", async () => {
    const { propose, post, call, bob, base, pending } = await setup();
    const { body } = await propose([cacheNode]);

    expect((await call(bob, base)).status).toBe(404);
    expect((await propose([cacheNode], bob)).res.status).toBe(404);
    expect((await post(bob, `${base}/${body.proposal.id}/apply`, {})).status).toBe(404);
    expect((await post(bob, `${base}/${body.proposal.id}/reject`, {})).status).toBe(404);
    expect(await pending()).toHaveLength(1);
  });
});
