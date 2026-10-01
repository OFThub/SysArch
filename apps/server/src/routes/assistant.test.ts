import type {
  BetaMessage,
  BetaMessageStreamParams,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { seraIot } from '@sysarch/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ModelTurn } from '../ai/assistant';
import { createHarness, testEnv } from '../test/harness';
import { ASSISTANT_LIMIT, createRateLimiter } from './assistant';

const say = (text: string) =>
  ({
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  }) as unknown as BetaMessage;
const rename = {
  content: [
    {
      type: 'tool_use',
      id: 't1',
      name: 'apply_ops',
      input: { ops: [{ op: 'update_node', id: 'dashboard', patch: { label: 'Yönetim paneli' } }] },
    },
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 1, output_tokens: 1 },
} as unknown as BetaMessage;

/** Plays back replies; records the requests. */
function fakeModel(...replies: BetaMessage[]) {
  const calls: BetaMessageStreamParams[] = [];
  const turn: ModelTurn = async (params, onText) => {
    calls.push(structuredClone(params));
    const next = replies.shift() ?? say('Tamam.');
    for (const b of next.content) if (b.type === 'text') onText(b.text);
    return next;
  };
  return { turn, calls };
}

async function setup(model?: ModelTurn) {
  const h = await createHarness(testEnv, model);
  const ada = await h.signIn('ada@example.test');
  const bob = await h.signIn('bob@example.test');
  const call = (who: { headers: Headers }, path: string, body?: object) => {
    const headers = new Headers(who.headers);
    if (body) headers.set('content-type', 'application/json');
    return h.app.request(`/api/projects${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body && JSON.stringify(body),
    });
  };
  const created = await call(ada, '', { name: 'Sera', doc: seraIot() });
  const project = (await created.json()) as { id: string };
  return { ...h, ada, bob, call, project, base: `/${project.id}/assistant` };
}

const events = async (res: Response) =>
  [...(await res.text()).matchAll(/event: (\w+)\ndata: (.*)/g)].map(([, event, data]) => ({
    event,
    data: JSON.parse(data!) as unknown,
  }));

describe('assistant api', () => {
  it('says it is unavailable without a model key', async () => {
    const { ada, call, base } = await setup();
    expect(await (await call(ada, base)).json()).toMatchObject({ available: false });
    expect((await call(ada, base, { message: 'Merhaba' })).status).toBe(503);
  });

  it('streams the reply, turns its changes into a chat proposal and keeps the transcript', async () => {
    const model = fakeModel(rename, say('Paneli yeniden adlandırdım.'));
    const { ada, call, base, project } = await setup(model.turn);

    const res = await call(ada, base, { message: 'Paneli yeniden adlandır' });
    const stream = await events(res);
    expect(stream.filter((e) => e.event === 'text').map((e) => e.data)).toEqual([
      'Paneli yeniden adlandırdım.',
    ]);
    const done = stream.at(-1)!;
    expect(done.event).toBe('done');
    expect(done.data).toMatchObject({ proposal: { source: 'chat', ops: [{ op: 'update_node' }] } });

    const proposals = await (await call(ada, `/${project.id}/proposals`)).json();
    expect(proposals).toMatchObject({ proposals: [{ source: 'chat' }] });
    const chat = (await (await call(ada, base)).json()) as {
      messages: { role: string; content: string; proposalId: string | null }[];
    };
    expect(chat.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Paneli yeniden adlandır'],
      ['assistant', 'Paneli yeniden adlandırdım.'],
    ]);
    expect(chat.messages[1]!.proposalId).toBeTruthy();

    // The next message carries the earlier turns.
    await events(await call(ada, base, { message: 'Teşekkürler' }));
    expect(
      model.calls
        .at(-1)!
        .messages.slice(0, 2)
        .map((m) => m.content),
    ).toEqual(['Paneli yeniden adlandır', 'Paneli yeniden adlandırdım.']);
  });

  it("keeps another user's project chat out of reach", async () => {
    const { bob, call, base } = await setup(fakeModel().turn);
    expect((await call(bob, base)).status).toBe(404);
    expect((await call(bob, base, { message: 'x' })).status).toBe(404);
  });

  it('reports a failed model call as an error event', async () => {
    const failing: ModelTurn = async () => {
      throw new Error('overloaded');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ada, call, base } = await setup(failing);
    const stream = await events(await call(ada, base, { message: 'x' }));
    expect(stream).toEqual([{ event: 'error', data: { error: 'assistant_failed' } }]);
  });

  it('limits each user to a number of replies per window', () => {
    const allow = createRateLimiter({ requests: 2, windowMs: 1000 });
    expect([allow('ada', 0), allow('ada', 1), allow('ada', 2), allow('bob', 2)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(allow('ada', 1001)).toBe(true);
    expect(ASSISTANT_LIMIT.requests).toBeGreaterThan(0);
  });
});
