import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { schema, type Db } from '../db';
import { issues, owned, readDoc } from './projects';

const { projects } = schema;

/** 32 random bytes as base64url: 43 characters nobody can guess. */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The owner's side of sharing under /projects/:id/share: read, create and
 * revoke the project's read-only link, and allow comments through it.
 * Revoking drops the token and the permission, so an old link stops
 * working at once; sharing again makes a new one, comments off.
 */
export function shareAdminRoutes(db: Db) {
  const linkOf = (id: string, ownerId: string) =>
    db
      .select({ token: projects.shareToken, comments: projects.shareComments })
      .from(projects)
      .where(owned(id, ownerId))
      .get();

  return new Hono<AppEnv>()
    .get('/:id/share', (c) => {
      const row = linkOf(c.req.param('id'), c.get('user').id);
      return row ? c.json(row) : c.json({ error: 'not_found' }, 404);
    })
    .post('/:id/share', (c) => {
      const id = c.req.param('id');
      const ownerId = c.get('user').id;
      const row = linkOf(id, ownerId);
      if (!row) return c.json({ error: 'not_found' }, 404);
      if (row.token) return c.json(row);
      const token = randomBytes(32).toString('base64url');
      db.update(projects).set({ shareToken: token }).where(owned(id, ownerId)).run();
      return c.json({ token, comments: row.comments }, 201);
    })
    .patch(
      '/:id/share',
      validator('json', (value, c) => {
        const r = z.object({ comments: z.boolean() }).safeParse(value);
        return r.success ? r.data : c.json({ error: 'invalid_body', issues: issues(r.error) }, 400);
      }),
      (c) => {
        const row = db
          .update(projects)
          .set({ shareComments: c.req.valid('json').comments })
          .where(owned(c.req.param('id'), c.get('user').id))
          .returning({ token: projects.shareToken, comments: projects.shareComments })
          .get();
        return row ? c.json(row) : c.json({ error: 'not_found' }, 404);
      },
    )
    .delete('/:id/share', (c) => {
      const gone = db
        .update(projects)
        .set({ shareToken: null, shareComments: false })
        .where(owned(c.req.param('id'), c.get('user').id))
        .returning({ id: projects.id })
        .get();
      return gone ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
    });
}

/**
 * The public side: anyone with the link reads the design, and whether the
 * link takes comments. No session, no owner or revision in the answer, and
 * not cached by shared caches, so a revoked link stops serving right away.
 */
export function sharePublicRoutes(db: Db) {
  return new Hono().get('/:token', (c) => {
    const token = c.req.param('token');
    const row = SHARE_TOKEN.test(token)
      ? db
          .select({ name: projects.name, doc: projects.doc, comments: projects.shareComments })
          .from(projects)
          .where(eq(projects.shareToken, token))
          .get()
      : undefined;
    if (!row) return c.json({ error: 'not_found' }, 404);
    const doc = readDoc(row.doc);
    if ('error' in doc) return c.json({ error: 'corrupt_doc' }, 500);
    c.header('Cache-Control', 'private, no-store');
    return c.json({ name: row.name, doc, comments: row.comments });
  });
}
