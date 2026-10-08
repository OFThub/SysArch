import { diffDocs, newId } from '@sysarch/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { schema, type Db } from '../db';
import type { EventBus } from '../events';
import { issues, owned, readDoc } from './projects';
import { createProposal, MAX_OPS } from './proposals';

const { projects, snapshots } = schema;

const NameBody = z.object({ name: z.string().trim().min(1).max(120) });
/** The summary the review list shows; written by the client in the user's language. */
const RestoreBody = z.object({ summary: z.string().trim().min(1).max(2000) });

const json = <T extends z.ZodType>(schema: T) =>
  validator('json', (value, c) => {
    const r = schema.safeParse(value);
    return r.success
      ? (r.data as z.infer<T>)
      : c.json({ error: 'invalid_body', issues: issues(r.error) }, 400);
  });

/**
 * Snapshots under /projects/:id/snapshots. A snapshot copies the doc as the
 * server holds it, never one the client sends, so it is always a state that
 * was really saved. Restoring is a proposal from the current doc to the
 * snapshot: the canvas previews the difference and the owner applies all of
 * it, part of it or none. Session and body checks come from the mount.
 */
export function snapshotRoutes(db: Db, events: EventBus) {
  const loadProject = (id: string, ownerId: string) =>
    db.select().from(projects).where(owned(id, ownerId)).get();
  const loadSnapshot = (projectId: string, id: string) =>
    db
      .select()
      .from(snapshots)
      .where(and(eq(snapshots.id, id), eq(snapshots.projectId, projectId)))
      .get();
  const summary = (s: { id: string; name: string; revision: number; createdAt: Date }) => ({
    id: s.id,
    name: s.name,
    revision: s.revision,
    createdAt: s.createdAt,
  });

  return new Hono<AppEnv>()
    .get('/:id/snapshots', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const rows = db
        .select()
        .from(snapshots)
        .where(eq(snapshots.projectId, project.id))
        .orderBy(desc(snapshots.createdAt))
        .all();
      return c.json({ snapshots: rows.map(summary) });
    })

    .post('/:id/snapshots', json(NameBody), (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const doc = readDoc(project.doc);
      if ('error' in doc) return c.json({ error: 'corrupt_doc', issues: doc.error }, 500);
      const row = db
        .insert(snapshots)
        .values({
          id: newId(),
          projectId: project.id,
          name: c.req.valid('json').name,
          doc,
          revision: project.revision,
        })
        .returning()
        .get();
      return c.json({ snapshot: summary(row) }, 201);
    })

    .get('/:id/snapshots/:sid', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      const snap = project && loadSnapshot(project.id, c.req.param('sid'));
      if (!snap) return c.json({ error: 'not_found' }, 404);
      const doc = readDoc(snap.doc);
      if ('error' in doc) return c.json({ error: 'corrupt_doc', issues: doc.error }, 500);
      return c.json({ snapshot: { ...summary(snap), doc } });
    })

    .delete('/:id/snapshots/:sid', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const gone = db
        .delete(snapshots)
        .where(and(eq(snapshots.id, c.req.param('sid')), eq(snapshots.projectId, project.id)))
        .returning({ id: snapshots.id })
        .get();
      return gone ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
    })

    .post('/:id/snapshots/:sid/restore', json(RestoreBody), (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      const snap = project && loadSnapshot(project.id, c.req.param('sid'));
      if (!project || !snap) return c.json({ error: 'not_found' }, 404);
      const current = readDoc(project.doc);
      const target = readDoc(snap.doc);
      if ('error' in current || 'error' in target) return c.json({ error: 'corrupt_doc' }, 500);

      const ops = diffDocs(current, target);
      if (!ops.length) return c.json({ proposal: null });
      if (ops.length > MAX_OPS)
        return c.json({ error: 'too_many_changes', count: ops.length }, 422);
      const r = createProposal(
        { db, events },
        { ...project, doc: current },
        'snapshot',
        c.req.valid('json').summary,
        ops,
      );
      if ('errors' in r) return c.json({ error: 'invalid_ops', errors: r.errors }, 422);
      return c.json({ proposal: r.proposal }, 201);
    })

    .post('/:id/snapshots/:sid/fork', json(NameBody), (c) => {
      const ownerId = c.get('user').id;
      const project = loadProject(c.req.param('id'), ownerId);
      const snap = project && loadSnapshot(project.id, c.req.param('sid'));
      if (!snap) return c.json({ error: 'not_found' }, 404);
      const doc = readDoc(snap.doc);
      if ('error' in doc) return c.json({ error: 'corrupt_doc', issues: doc.error }, 500);
      const name = c.req.valid('json').name;
      doc.meta.name = name;
      const id = newId();
      db.insert(projects).values({ id, ownerId, name, doc }).run();
      return c.json({ id }, 201);
    });
}
