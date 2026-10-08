import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { schema, type Db } from '../db';
import { owned, readDoc } from './projects';

const { projects } = schema;

/** 32 random bytes as base64url: 43 characters nobody can guess. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The owner's side of sharing under /projects/:id/share: read, create and
 * revoke the project's read-only link. Revoking drops the token, so an old
 * link stops working at once; sharing again makes a new one.
 */
export function shareAdminRoutes(db: Db) {
  const tokenOf = (id: string, ownerId: string) =>
    db.select({ token: projects.shareToken }).from(projects).where(owned(id, ownerId)).get();

  return new Hono<AppEnv>()
    .get('/:id/share', (c) => {
      const row = tokenOf(c.req.param('id'), c.get('user').id);
      return row ? c.json({ token: row.token }) : c.json({ error: 'not_found' }, 404);
    })
    .post('/:id/share', (c) => {
      const id = c.req.param('id');
      const ownerId = c.get('user').id;
      const row = tokenOf(id, ownerId);
      if (!row) return c.json({ error: 'not_found' }, 404);
      if (row.token) return c.json({ token: row.token });
      const token = randomBytes(32).toString('base64url');
      db.update(projects).set({ shareToken: token }).where(owned(id, ownerId)).run();
      return c.json({ token }, 201);
    })
    .delete('/:id/share', (c) => {
      const gone = db
        .update(projects)
        .set({ shareToken: null })
        .where(owned(c.req.param('id'), c.get('user').id))
        .returning({ id: projects.id })
        .get();
      return gone ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
    });
}

/**
 * The public side: anyone with the link reads the design, nothing else. No
 * session, no owner or revision in the answer, and not cached by shared
 * caches, so a revoked link stops serving right away.
 */
export function sharePublicRoutes(db: Db) {
  return new Hono().get('/:token', (c) => {
    const token = c.req.param('token');
    const row = TOKEN.test(token)
      ? db
          .select({ name: projects.name, doc: projects.doc })
          .from(projects)
          .where(eq(projects.shareToken, token))
          .get()
      : undefined;
    if (!row) return c.json({ error: 'not_found' }, 404);
    const doc = readDoc(row.doc);
    if ('error' in doc) return c.json({ error: 'corrupt_doc' }, 500);
    c.header('Cache-Control', 'private, no-store');
    return c.json({ name: row.name, doc });
  });
}
