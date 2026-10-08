import { NodeSchema, newId } from '@sysarch/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';
import type { AppEnv } from '../app';
import type { SessionUser } from '../auth';
import { schema, type Db } from '../db';
import { clientOrigin, type EventBus } from '../events';
import { createRateLimiter } from './assistant';
import { issues, owned, readDoc } from './projects';
import { SHARE_TOKEN } from './share';

const { comments, projects, user } = schema;

/** Per user, across every link: plenty for a review, too few to flood a project. */
export const COMMENT_LIMIT = { requests: 30, windowMs: 10 * 60_000 };

const Id = NodeSchema.shape.id;
const NewComment = z
  .object({
    body: z.string().trim().min(1).max(2000),
    /** Starts a thread about the project, a component or a link... */
    target: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('project') }),
        z.object({ kind: z.enum(['node', 'edge']), id: Id }),
      ])
      .optional(),
    /** ...or replies to one. */
    parentId: Id.optional(),
  })
  .refine((v) => !v.target !== !v.parentId, 'give either target or parentId');
type NewComment = z.infer<typeof NewComment>;

const json = <T extends z.ZodType>(schema: T) =>
  validator('json', (value, c) => {
    const r = schema.safeParse(value);
    return r.success
      ? (r.data as z.infer<T>)
      : c.json({ error: 'invalid_body', issues: issues(r.error) }, 400);
  });

type Project = { id: string; ownerId: string; doc: unknown };
/** Who is reading: deleting is for the project owner and a comment's own author. */
type Viewer = { id: string; owner: boolean } | null;

/**
 * Every comment of a project, oldest first. Readers see an author's name,
 * never their email or id; `canDelete` says what this reader may remove.
 */
function list(db: Db, projectId: string, viewer: Viewer) {
  return (
    db
      .select({
        id: comments.id,
        parentId: comments.parentId,
        targetKind: comments.targetKind,
        targetId: comments.targetId,
        body: comments.body,
        resolvedAt: comments.resolvedAt,
        createdAt: comments.createdAt,
        authorId: comments.authorId,
        author: user.name,
      })
      .from(comments)
      .innerJoin(user, eq(user.id, comments.authorId))
      .where(eq(comments.projectId, projectId))
      // Insertion order: timestamps can tie within a millisecond.
      .orderBy(sql`${comments}.rowid`)
      .all()
      .map(({ authorId, ...c }) => ({
        ...c,
        canDelete: !!viewer && (viewer.owner || viewer.id === authorId),
      }))
  );
}
export type CommentView = ReturnType<typeof list>[number];

type Added = { id: string } | { error: 'not_found' | 'unknown_target' | 'corrupt_doc' };

function add(db: Db, project: Project, authorId: string, input: NewComment): Added {
  let target: { kind: 'project' | 'node' | 'edge'; id: string | null };
  if (input.parentId) {
    const root = db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.id, input.parentId),
          eq(comments.projectId, project.id),
          isNull(comments.parentId),
        ),
      )
      .get();
    if (!root) return { error: 'not_found' };
    target = { kind: root.targetKind, id: root.targetId };
    // A reply means the discussion is open again.
    if (root.resolvedAt)
      db.update(comments).set({ resolvedAt: null }).where(eq(comments.id, root.id)).run();
  } else {
    const t = input.target!;
    target = { kind: t.kind, id: 'id' in t ? t.id : null };
    // A new thread points at something the design has now.
    if (t.kind !== 'project') {
      const doc = readDoc(project.doc);
      if ('error' in doc) return { error: 'corrupt_doc' };
      const items: { id: string }[] = t.kind === 'node' ? doc.nodes : doc.edges;
      if (!items.some((x) => x.id === t.id)) return { error: 'unknown_target' };
    }
  }
  const id = newId();
  db.insert(comments)
    .values({
      id,
      projectId: project.id,
      authorId,
      parentId: input.parentId ?? null,
      targetKind: target.kind,
      targetId: target.id,
      body: input.body,
    })
    .run();
  return { id };
}

const STATUS = { not_found: 404, unknown_target: 400, corrupt_doc: 500 } as const;

/** Removes a comment (a root takes its replies along) if this viewer may. */
function remove(db: Db, projectId: string, id: string, viewer: NonNullable<Viewer>) {
  const mayDelete = viewer.owner ? undefined : eq(comments.authorId, viewer.id);
  return !!db
    .delete(comments)
    .where(and(eq(comments.id, id), eq(comments.projectId, projectId), mayDelete))
    .returning({ id: comments.id })
    .get();
}

/**
 * The owner's side under /projects/:id/comments: read, write, resolve and
 * remove any comment. Session and body checks come from the mount.
 */
export function commentRoutes(db: Db, events: EventBus) {
  const loadProject = (id: string, ownerId: string): Project | undefined =>
    db
      .select({ id: projects.id, ownerId: projects.ownerId, doc: projects.doc })
      .from(projects)
      .where(owned(id, ownerId))
      .get();
  const changed = (projectId: string, header: string | undefined) =>
    events.publish(projectId, { type: 'comments.changed', origin: clientOrigin(header) });

  return new Hono<AppEnv>()
    .get('/:id/comments', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      return c.json({ comments: list(db, project.id, { id: project.ownerId, owner: true }) });
    })

    .post('/:id/comments', json(NewComment), (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const r = add(db, project, project.ownerId, c.req.valid('json'));
      if ('error' in r) return c.json({ error: r.error }, STATUS[r.error]);
      changed(project.id, c.req.header('X-Client-Id'));
      return c.json(r, 201);
    })

    .patch('/:id/comments/:cid', json(z.object({ resolved: z.boolean() })), (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      // Resolving is per thread, so only a root takes it.
      const done = db
        .update(comments)
        .set({ resolvedAt: c.req.valid('json').resolved ? new Date() : null })
        .where(
          and(
            eq(comments.id, c.req.param('cid')),
            eq(comments.projectId, project.id),
            isNull(comments.parentId),
          ),
        )
        .returning({ id: comments.id })
        .get();
      if (!done) return c.json({ error: 'not_found' }, 404);
      changed(project.id, c.req.header('X-Client-Id'));
      return c.body(null, 204);
    })

    .delete('/:id/comments/:cid', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const viewer = { id: project.ownerId, owner: true };
      if (!remove(db, project.id, c.req.param('cid'), viewer))
        return c.json({ error: 'not_found' }, 404);
      changed(project.id, c.req.header('X-Client-Id'));
      return c.body(null, 204);
    });
}

/**
 * Comments through a share link under /share/:token/comments, open only
 * while the owner allows them on that link; otherwise the link has no
 * comments at all (404). Anyone with the link reads; writing and removing
 * one's own comment need a session.
 */
export function sharedCommentRoutes(
  db: Db,
  events: EventBus,
  session: {
    requireUser: MiddlewareHandler<AppEnv>;
    sessionUser: (headers: Headers) => Promise<SessionUser | null>;
  },
) {
  const allow = createRateLimiter(COMMENT_LIMIT);
  const linked = (token: string): Project | undefined =>
    SHARE_TOKEN.test(token)
      ? db
          .select({ id: projects.id, ownerId: projects.ownerId, doc: projects.doc })
          .from(projects)
          .where(and(eq(projects.shareToken, token), eq(projects.shareComments, true)))
          .get()
      : undefined;
  const viewerOf = (project: Project, u: SessionUser) => ({
    id: u.id,
    owner: u.id === project.ownerId,
  });

  return new Hono<AppEnv>()
    .get('/:token/comments', async (c) => {
      const project = linked(c.req.param('token'));
      if (!project) return c.json({ error: 'not_found' }, 404);
      const u = await session.sessionUser(c.req.raw.headers);
      c.header('Cache-Control', 'private, no-store');
      return c.json({ comments: list(db, project.id, u && viewerOf(project, u)) });
    })

    .post('/:token/comments', session.requireUser, json(NewComment), (c) => {
      const project = linked(c.req.param('token'));
      if (!project) return c.json({ error: 'not_found' }, 404);
      const u = c.get('user');
      if (!allow(u.id)) return c.json({ error: 'rate_limited' }, 429);
      const r = add(db, project, u.id, c.req.valid('json'));
      if ('error' in r) return c.json({ error: r.error }, STATUS[r.error]);
      events.publish(project.id, { type: 'comments.changed' });
      return c.json(r, 201);
    })

    .delete('/:token/comments/:cid', session.requireUser, (c) => {
      const project = linked(c.req.param('token'));
      if (!project) return c.json({ error: 'not_found' }, 404);
      if (!remove(db, project.id, c.req.param('cid'), viewerOf(project, c.get('user'))))
        return c.json({ error: 'not_found' }, 404);
      events.publish(project.id, { type: 'comments.changed' });
      return c.body(null, 204);
    });
}
