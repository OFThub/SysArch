import {
  applyOps,
  newId,
  newIssues,
  OpSchema,
  type ArchDoc,
  type Issue,
  type Op,
  type OpError,
} from '@sysarch/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { schema, type Db } from '../db';
import { clientOrigin, type EventBus } from '../events';
import { etag, issues, owned, readDoc } from './projects';

const { projects, proposals } = schema;

/** An assistant turn is a handful of ops; an import a few hundred. */
export const MAX_OPS = 500;

const OpsSchema = z.array(OpSchema).min(1).max(MAX_OPS);

const CreateBody = z.object({
  summary: z.string().trim().min(1).max(2000),
  ops: OpsSchema,
});

const ApplyBody = z.object({
  /** Indexes of the ops to apply; all of them when left out. */
  accept: z.array(z.number().int().nonnegative()).max(MAX_OPS).optional(),
});

export interface Proposal {
  id: string;
  source: 'chat' | 'mcp';
  summary: string;
  ops: Op[];
  newIssues: Issue[];
  baseRevision: number;
  status: 'pending' | 'applied' | 'rejected';
}

/**
 * Stores a proposal after a dry run on the project's doc. Ops that do not
 * apply come back with their reasons instead, so the model that wrote them
 * can correct itself; nothing half-valid is ever stored.
 */
export function createProposal(
  { db, events }: { db: Db; events: EventBus },
  project: { id: string; revision: number; doc: ArchDoc },
  source: Proposal['source'],
  summary: string,
  ops: Op[],
): { proposal: Proposal } | { errors: OpError[] } {
  const draft = applyOps(project.doc, ops);
  if (draft.errors.length) return { errors: draft.errors };
  const proposal: Proposal = {
    id: newId(),
    source,
    summary,
    ops,
    newIssues: newIssues(project.doc, draft.doc),
    baseRevision: project.revision,
    status: 'pending',
  };
  db.insert(proposals)
    .values({ ...proposal, projectId: project.id })
    .run();
  // Open editors list it at once, wherever it came from.
  events.publish(project.id, { type: 'proposal.changed' });
  return { proposal };
}

/** Proposal review under /projects/:id/proposals. Session and body checks come from the mount. */
export function proposalRoutes(db: Db, events: EventBus) {
  const loadProject = (id: string, ownerId: string) => {
    const row = db.select().from(projects).where(owned(id, ownerId)).get();
    return row && { row, doc: readDoc(row.doc) };
  };
  const loadProposal = (projectId: string, id: string) =>
    db
      .select()
      .from(proposals)
      .where(and(eq(proposals.id, id), eq(proposals.projectId, projectId)))
      .get();

  return new Hono<AppEnv>()
    .get('/:id/proposals', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const rows = db
        .select()
        .from(proposals)
        .where(and(eq(proposals.projectId, project.row.id), eq(proposals.status, 'pending')))
        .orderBy(desc(proposals.createdAt))
        .all();
      return c.json({ proposals: rows.map(toProposal) });
    })

    .post(
      '/:id/proposals',
      validator('json', (value, c) => {
        const r = CreateBody.safeParse(value);
        return r.success ? r.data : c.json({ error: 'invalid_body', issues: issues(r.error) }, 400);
      }),
      (c) => {
        const project = loadProject(c.req.param('id'), c.get('user').id);
        if (!project) return c.json({ error: 'not_found' }, 404);
        const doc = project.doc;
        if ('error' in doc) return c.json({ error: 'corrupt_doc' }, 500);
        const { summary, ops } = c.req.valid('json');
        const r = createProposal({ db, events }, { ...project.row, doc }, 'mcp', summary, ops);
        if ('errors' in r) return c.json({ error: 'invalid_ops', errors: r.errors }, 422);
        return c.json({ proposal: r.proposal }, 201);
      },
    )

    .post(
      '/:id/proposals/:pid/apply',
      validator('json', (value, c) => {
        const r = ApplyBody.safeParse(value);
        return r.success ? r.data : c.json({ error: 'invalid_body', issues: issues(r.error) }, 400);
      }),
      (c) => {
        const project = loadProject(c.req.param('id'), c.get('user').id);
        if (!project) return c.json({ error: 'not_found' }, 404);
        const doc = project.doc;
        if ('error' in doc) return c.json({ error: 'corrupt_doc' }, 500);
        const row = loadProposal(project.row.id, c.req.param('pid'));
        if (!row) return c.json({ error: 'not_found' }, 404);
        if (row.status !== 'pending')
          return c.json({ error: 'not_pending', status: row.status }, 409);

        const ops = toProposal(row).ops;
        const { accept } = c.req.valid('json');
        if (accept?.some((i) => i >= ops.length)) return c.json({ error: 'unknown_op' }, 400);
        // Keep each op's original index, so a conflict names the op the user saw.
        const chosen = ops
          .map((op, index) => ({ op, index }))
          .filter((x) => !accept || accept.includes(x.index));

        // Replayed on the doc as it is now: edits made since the proposal
        // stay, and an op they made impossible is reported, never forced.
        const result = applyOps(
          doc,
          chosen.map((x) => x.op),
        );
        if (result.errors.length) {
          const errors = result.errors.map((e) => ({ ...e, index: chosen[e.index]!.index }));
          return c.json({ error: 'ops_conflict', errors }, 409);
        }

        const { id, ownerId, revision: base } = project.row;
        const landed = db.transaction((tx) => {
          const updated = tx
            .update(projects)
            .set({ doc: result.doc, name: result.doc.meta.name, revision: base + 1 })
            .where(and(owned(id, ownerId), eq(projects.revision, base)))
            .returning({ revision: projects.revision })
            .get();
          if (updated)
            tx.update(proposals).set({ status: 'applied' }).where(eq(proposals.id, row.id)).run();
          return updated !== undefined;
        });
        if (!landed) return c.json({ error: 'revision_conflict' }, 409);
        const origin = clientOrigin(c.req.header('X-Client-Id'));
        events.publish(id, { type: 'doc.updated', revision: base + 1, origin });
        events.publish(id, { type: 'proposal.changed', origin });
        c.header('ETag', etag(base + 1));
        return c.json({ revision: base + 1, doc: result.doc });
      },
    )

    .post('/:id/proposals/:pid/reject', (c) => {
      const project = loadProject(c.req.param('id'), c.get('user').id);
      if (!project) return c.json({ error: 'not_found' }, 404);
      const rejected = db
        .update(proposals)
        .set({ status: 'rejected' })
        .where(
          and(
            eq(proposals.id, c.req.param('pid')),
            eq(proposals.projectId, project.row.id),
            eq(proposals.status, 'pending'),
          ),
        )
        .returning({ id: proposals.id })
        .get();
      if (!rejected) return c.json({ error: 'not_found' }, 404);
      events.publish(project.row.id, {
        type: 'proposal.changed',
        origin: clientOrigin(c.req.header('X-Client-Id')),
      });
      return c.body(null, 204);
    });
}

/** Stored JSON is re-parsed on the way out: what gets applied is always a valid Op[]. */
function toProposal(row: typeof proposals.$inferSelect): Proposal {
  return {
    id: row.id,
    source: row.source,
    summary: row.summary,
    ops: OpsSchema.parse(row.ops),
    newIssues: row.newIssues as Issue[],
    baseRevision: row.baseRevision,
    status: row.status,
  };
}
