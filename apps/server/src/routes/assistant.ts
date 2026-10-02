import { newId, NodeSchema } from '@sysarch/shared';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { validator } from 'hono/validator';
import { z } from 'zod';
import { runAssistant, type ModelTurn } from '../ai/assistant';
import type { AppEnv } from '../app';
import { schema, type Db } from '../db';
import type { EventBus } from '../events';
import { createProposal } from './proposals';
import { issues, owned, readDoc } from './projects';

const { projects, chatMessages } = schema;

/** Per user, across projects: each reply is several model calls. */
export const ASSISTANT_LIMIT = { requests: 20, windowMs: 10 * 60_000 };
/** Earlier turns sent with a new message; older ones stay in the transcript only. */
const HISTORY_TURNS = 20;

const Id = NodeSchema.shape.id;
const Body = z.object({
  message: z.string().trim().min(1).max(4000),
  viewId: Id.optional(),
  selection: z.object({ nodeIds: z.array(Id).max(500), edgeIds: z.array(Id).max(500) }).optional(),
});

/**
 * Sliding-window request counter.
 * ponytail: in-process, like the event bus; per-instance limits once there
 * is more than one instance.
 */
export function createRateLimiter({ requests, windowMs }: typeof ASSISTANT_LIMIT) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const allowed = recent.length < requests;
    if (allowed) recent.push(now);
    hits.set(key, recent);
    return allowed;
  };
}

/**
 * The project chat. A reply streams as SSE (`text` deltas, then `done` with
 * the proposal it produced). Changes become a proposal like any other: the
 * assistant never writes the doc.
 */
export function assistantRoutes(db: Db, events: EventBus, model: ModelTurn | undefined) {
  const allow = createRateLimiter(ASSISTANT_LIMIT);
  const loadProject = (id: string, ownerId: string) =>
    db.select().from(projects).where(owned(id, ownerId)).get();
  const transcript = (projectId: string, limit: number) =>
    db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.projectId, projectId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .all()
      .reverse();

  return new Hono<AppEnv>()
    .get('/:id/assistant', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const messages = transcript(project.id, 100).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        proposalId: m.proposalId,
      }));
      return c.json({ available: model !== undefined, messages });
    })

    .post(
      '/:id/assistant',
      validator('json', (value, c) => {
        const r = Body.safeParse(value);
        return r.success ? r.data : c.json({ error: 'invalid_body', issues: issues(r.error) }, 400);
      }),
      (c) => {
        if (!model) return c.json({ error: 'assistant_unavailable' }, 503);
        const user = c.get('user');
        const project = loadProject(c.req.param('id'), user.id);
        if (!project) return c.json({ error: 'not_found' }, 404);
        const doc = readDoc(project.doc);
        if ('error' in doc) return c.json({ error: 'corrupt_doc' }, 500);
        if (!allow(user.id)) return c.json({ error: 'rate_limited' }, 429);

        const { message, viewId, selection } = c.req.valid('json');
        const history = transcript(project.id, HISTORY_TURNS).map((m) => ({
          role: m.role,
          content: m.content,
        }));
        db.insert(chatMessages)
          .values({ id: newId(), projectId: project.id, role: 'user', content: message })
          .run();

        return streamSSE(c, async (stream) => {
          try {
            const r = await runAssistant(
              model,
              { doc, history, message, viewId, selection },
              (delta) => void stream.writeSSE({ event: 'text', data: JSON.stringify(delta) }),
            );
            let proposal = null;
            if (r.ops.length) {
              const summary = r.text.trim().slice(0, 2000) || message.slice(0, 2000);
              const created = createProposal(
                { db, events },
                { ...project, doc },
                'chat',
                summary,
                r.ops,
              );
              if ('proposal' in created) proposal = created.proposal;
            }
            db.insert(chatMessages)
              .values({
                id: newId(),
                projectId: project.id,
                role: 'assistant',
                content: r.text,
                proposalId: proposal?.id ?? null,
              })
              .run();
            // Token use per reply, for cost tracking; no message content in logs.
            console.info(JSON.stringify({ event: 'assistant', userId: user.id, ...r.usage }));
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({ text: r.text, refused: r.refused, proposal }),
            });
          } catch (e) {
            console.error('assistant failed', e);
            await stream.writeSSE({
              event: 'error',
              data: JSON.stringify({ error: 'assistant_failed' }),
            });
          }
        });
      },
    );
}
