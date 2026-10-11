import { seraIot } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../events';
import { createHarness } from '../test/harness';
import { COMMENT_LIMIT, type CommentView } from './comments';

type Who = { headers: Headers } | null;

async function setup() {
  const h = await createHarness();
  const ada = await h.signIn('ada@example.test');
  const bob = await h.signIn('bob@example.test');
  const call = (who: Who, path: string, method = 'GET', body?: unknown) =>
    h.app.request(`/api${path}`, {
      method,
      headers: {
        ...(who ? Object.fromEntries(who.headers) : {}),
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const created = await call(ada, '/projects', 'POST', { name: 'Sera', doc: seraIot() });
  const { id } = (await created.json()) as { id: string };
  const list = async (who: Who, path: string) =>
    ((await (await call(who, path)).json()) as { comments: CommentView[] }).comments;
  return { h, ada, bob, call, id, list };
}

describe('comments for the owner', () => {
  it('threads on a component: reply, resolve, reopen by replying, delete with replies', async () => {
    const { ada, call, id, list } = await setup();
    const base = `/projects/${id}/comments`;

    const root = await call(ada, base, 'POST', {
      body: 'BME280 3.3 V mu?',
      target: { kind: 'node', id: 'esp32' },
    });
    expect(root.status).toBe(201);
    const { id: rootId } = (await root.json()) as { id: string };
    const reply = await call(ada, base, 'POST', { body: 'Evet.', parentId: rootId });
    expect(reply.status).toBe(201);
    const { id: replyId } = (await reply.json()) as { id: string };

    let all = await list(ada, base);
    expect(all.map((c) => [c.body, c.parentId, c.targetKind, c.targetId])).toEqual([
      ['BME280 3.3 V mu?', null, 'node', 'esp32'],
      // A reply carries its thread's target.
      ['Evet.', rootId, 'node', 'esp32'],
    ]);
    expect(all.every((c) => c.canDelete && c.author.length > 0)).toBe(true);

    expect((await call(ada, `${base}/${rootId}`, 'PATCH', { resolved: true })).status).toBe(204);
    expect((await list(ada, base))[0]!.resolvedAt).not.toBeNull();
    // Only a thread's root is resolved.
    expect((await call(ada, `${base}/${replyId}`, 'PATCH', { resolved: true })).status).toBe(404);
    await call(ada, base, 'POST', { body: 'Yine de bakalım.', parentId: rootId });
    expect((await list(ada, base))[0]!.resolvedAt).toBeNull();

    expect((await call(ada, `${base}/${rootId}`, 'DELETE')).status).toBe(204);
    all = await list(ada, base);
    expect(all).toEqual([]);
  });

  it('refuses what does not fit: unknown targets, nested replies, empty or ambiguous bodies', async () => {
    const { ada, call, id } = await setup();
    const base = `/projects/${id}/comments`;
    const post = (body: unknown) => call(ada, base, 'POST', body);

    expect((await post({ body: 'x', target: { kind: 'node', id: 'nope' } })).status).toBe(400);
    expect((await post({ body: 'x', target: { kind: 'edge', id: 'esp32' } })).status).toBe(400);
    expect((await post({ body: '  ', target: { kind: 'project' } })).status).toBe(400);
    expect((await post({ body: 'x' })).status).toBe(400);
    expect((await post({ body: 'x', target: { kind: 'project' }, parentId: 'abc' })).status).toBe(
      400,
    );
    expect((await post({ body: 'x'.repeat(2001), target: { kind: 'project' } })).status).toBe(400);

    const root = (await (await post({ body: 'x', target: { kind: 'project' } })).json()) as {
      id: string;
    };
    const reply = (await (await post({ body: 'y', parentId: root.id })).json()) as { id: string };
    // Replies stay one level deep.
    expect((await post({ body: 'z', parentId: reply.id })).status).toBe(404);
  });

  it("hides another owner's comments behind the same 404 as a missing project", async () => {
    const { ada, bob, call, id } = await setup();
    const base = `/projects/${id}/comments`;
    const { id: cid } = (await (
      await call(ada, base, 'POST', { body: 'x', target: { kind: 'project' } })
    ).json()) as { id: string };

    expect((await call(bob, base)).status).toBe(404);
    expect((await call(bob, base, 'POST', { body: 'x', target: { kind: 'project' } })).status).toBe(
      404,
    );
    expect((await call(bob, `${base}/${cid}`, 'PATCH', { resolved: true })).status).toBe(404);
    expect((await call(bob, `${base}/${cid}`, 'DELETE')).status).toBe(404);
    expect((await call(null, base)).status).toBe(401);
  });
});

describe('comments through a share link', () => {
  async function shared() {
    const s = await setup();
    const share = `/projects/${s.id}/share`;
    const { token } = (await (await s.call(s.ada, share, 'POST')).json()) as { token: string };
    return { ...s, share, token, base: `/share/${token}/comments` };
  }

  it('stays closed until the owner allows comments, and revoking closes it again', async () => {
    const { ada, bob, call, share, token, base } = await shared();
    expect(await (await call(ada, share)).json()).toEqual({ token, comments: false });
    expect(
      ((await (await call(null, `/share/${token}`)).json()) as { comments: boolean }).comments,
    ).toBe(false);
    expect((await call(null, base)).status).toBe(404);
    expect((await call(bob, base, 'POST', { body: 'x', target: { kind: 'project' } })).status).toBe(
      404,
    );

    expect(await (await call(ada, share, 'PATCH', { comments: true })).json()).toEqual({
      token,
      comments: true,
    });
    expect((await call(null, base)).status).toBe(200);
    // Only the owner changes the setting.
    expect((await call(bob, share, 'PATCH', { comments: false })).status).toBe(404);

    expect((await call(ada, share, 'DELETE')).status).toBe(204);
    expect((await call(null, base)).status).toBe(404);
    const again = (await (await call(ada, share, 'POST')).json()) as {
      token: string;
      comments: boolean;
    };
    expect(again.comments).toBe(false);
  });

  it('lets anyone read, signed-in visitors write, and each delete only what they may', async () => {
    const { h, ada, bob, call, id, list, share, base } = await shared();
    await call(ada, share, 'PATCH', { comments: true });
    const heard: ProjectEvent[] = [];
    h.events.subscribe(id, (e) => heard.push(e));

    expect(
      (await call(null, base, 'POST', { body: 'x', target: { kind: 'project' } })).status,
    ).toBe(401);
    const bobs = await call(bob, base, 'POST', {
      body: 'Neden MQTT?',
      target: { kind: 'node', id: 'mqtt' },
    });
    expect(bobs.status).toBe(201);
    const { id: bobId } = (await bobs.json()) as { id: string };
    expect(heard).toEqual([{ type: 'comments.changed' }]);

    const { id: adaId } = (await (
      await call(ada, `/projects/${id}/comments`, 'POST', {
        body: 'Sensör ağı için.',
        parentId: bobId,
      })
    ).json()) as { id: string };

    // Names, never emails, reach the link.
    const raw = await (await call(null, base)).text();
    expect(raw).toContain(bob.user.name);
    expect(raw).not.toContain('@example.test');
    expect((await list(null, base)).map((c) => c.canDelete)).toEqual([false, false]);
    expect((await list(bob, base)).map((c) => c.canDelete)).toEqual([true, false]);
    expect((await list(ada, base)).map((c) => c.canDelete)).toEqual([true, true]);

    // Bob cannot remove Ada's reply or resolve anything; Ada removes his thread.
    expect((await call(bob, `${base}/${adaId}`, 'DELETE')).status).toBe(404);
    expect((await call(bob, `${base}/${bobId}`, 'PATCH', { resolved: true })).status).toBe(404);
    expect((await call(ada, `${base}/${bobId}`, 'DELETE')).status).toBe(204);
    expect(await list(null, base)).toEqual([]);
  });

  it('limits how fast one visitor writes and how large a request may be', async () => {
    const { ada, bob, call, share, base } = await shared();
    await call(ada, share, 'PATCH', { comments: true });
    for (let i = 0; i < COMMENT_LIMIT.requests; i++)
      expect(
        (await call(bob, base, 'POST', { body: `${i}`, target: { kind: 'project' } })).status,
      ).toBe(201);
    expect((await call(bob, base, 'POST', { body: 'x', target: { kind: 'project' } })).status).toBe(
      429,
    );

    const big = await call(ada, base, 'POST', {
      body: 'x'.repeat(20_000),
      target: { kind: 'project' },
    });
    expect(big.status).toBe(413);
  });
});
