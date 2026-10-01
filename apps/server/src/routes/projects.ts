import { ArchDocSchema, createEmptyDoc, migrate, newId, type ArchDoc } from '@sysarch/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { validator } from 'hono/validator';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { schema, type Db } from '../db';
import { clientOrigin, type EventBus } from '../events';

const { projects } = schema;

/** Largest accepted request body. A big architecture is well under 1 MB of JSON. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  /** Optional starting doc (template or import); any stored version is accepted and migrated. */
  doc: z.unknown().optional(),
});

/** ETag / If-Match carry the revision as a quoted string: "7". */
export const etag = (revision: number) => `"${revision}"`;
function parseIfMatch(header: string | undefined): number | undefined {
  const n = Number(header?.replace(/^W\//, '').replaceAll('"', '').trim());
  return header && Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Validation errors as `path: message` lines the client can show next to the problem. */
export const issues = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

/**
 * Every query filters by owner as well as id, so another user's project is
 * indistinguishable from a missing one (404, never 403).
 */
export const owned = (id: string, ownerId: string) =>
  and(eq(projects.id, id), eq(projects.ownerId, ownerId));

/** Stored docs may predate the current schema; every read migrates. */
export function readDoc(raw: unknown): ArchDoc | { error: string[] } {
  try {
    return migrate(raw);
  } catch (e) {
    return { error: e instanceof z.ZodError ? issues(e) : [(e as Error).message] };
  }
}

/** Comment heartbeat: keeps proxies from closing an idle stream. */
const HEARTBEAT_MS = 25_000;

/** Project CRUD. Session and body-size checks are applied where it is mounted. */
export function projectRoutes(db: Db, events: EventBus) {
  return (
    new Hono<AppEnv>()
      .get('/', (c) => {
        const rows = db
          .select({
            id: projects.id,
            name: projects.name,
            revision: projects.revision,
            updatedAt: projects.updatedAt,
          })
          .from(projects)
          .where(eq(projects.ownerId, c.get('user').id))
          .orderBy(desc(projects.updatedAt))
          .all();
        return c.json({ projects: rows });
      })

      .post(
        '/',
        validator('json', (value, c) => {
          const r = CreateBody.safeParse(value);
          return r.success
            ? r.data
            : c.json({ error: 'invalid_body', issues: issues(r.error) }, 400);
        }),
        (c) => {
          const { name, doc: raw } = c.req.valid('json');
          const doc = raw === undefined ? createEmptyDoc(name) : readDoc(raw);
          if ('error' in doc) return c.json({ error: 'invalid_doc', issues: doc.error }, 400);
          doc.meta.name = name;

          const id = newId();
          db.insert(projects)
            .values({ id, ownerId: c.get('user').id, name, doc })
            .run();
          c.header('ETag', etag(1));
          return c.json({ id, name, revision: 1, doc }, 201);
        },
      )

      .get('/:id', (c) => {
        const row = db
          .select()
          .from(projects)
          .where(owned(c.req.param('id'), c.get('user').id))
          .get();
        if (!row) return c.json({ error: 'not_found' }, 404);
        const doc = readDoc(row.doc);
        if ('error' in doc) return c.json({ error: 'corrupt_doc', issues: doc.error }, 500);
        c.header('ETag', etag(row.revision));
        return c.json({ id: row.id, name: row.name, revision: row.revision, doc });
      })

      .put(
        '/:id',
        validator('json', (value, c) => {
          const r = z.object({ doc: ArchDocSchema }).safeParse(value);
          return r.success
            ? r.data
            : c.json({ error: 'invalid_doc', issues: issues(r.error) }, 400);
        }),
        (c) => {
          const id = c.req.param('id');
          const userId = c.get('user').id;
          const expected = parseIfMatch(c.req.header('If-Match'));
          // Without the revision the client edited, a save would silently clobber others.
          if (expected === undefined) return c.json({ error: 'if_match_required' }, 428);

          const { doc } = c.req.valid('json');
          // Compare-and-swap in one statement: it only lands if nobody saved in between.
          const updated = db
            .update(projects)
            .set({ doc, name: doc.meta.name, revision: expected + 1 })
            .where(and(owned(id, userId), eq(projects.revision, expected)))
            .returning({ revision: projects.revision })
            .get();
          if (updated) {
            events.publish(id, {
              type: 'doc.updated',
              revision: updated.revision,
              origin: clientOrigin(c.req.header('X-Client-Id')),
            });
            c.header('ETag', etag(updated.revision));
            return c.json({ revision: updated.revision });
          }

          const current = db
            .select({ revision: projects.revision })
            .from(projects)
            .where(owned(id, userId))
            .get();
          if (!current) return c.json({ error: 'not_found' }, 404);
          c.header('ETag', etag(current.revision));
          return c.json({ error: 'revision_conflict', revision: current.revision }, 409);
        },
      )

      /**
       * Server-sent events for one project: saves from elsewhere and proposal
       * changes. The browser's EventSource reconnects on its own.
       */
      .get('/:id/events', (c) => {
        const id = c.req.param('id');
        const project = db
          .select({ id: projects.id })
          .from(projects)
          .where(owned(id, c.get('user').id))
          .get();
        if (!project) return c.json({ error: 'not_found' }, 404);

        return streamSSE(c, async (stream) => {
          const unsubscribe = events.subscribe(id, (event) => {
            void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
          });
          stream.onAbort(unsubscribe);
          // Tells the client (and tests) the subscription is live.
          await stream.write(': connected\n\n');
          while (!stream.aborted) {
            await stream.sleep(HEARTBEAT_MS);
            if (!stream.aborted) await stream.write(': ping\n\n');
          }
          unsubscribe();
        });
      })

      .delete('/:id', (c) => {
        const gone = db
          .delete(projects)
          .where(owned(c.req.param('id'), c.get('user').id))
          .returning({ id: projects.id })
          .get();
        return gone ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
      })
  );
}
