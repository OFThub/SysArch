import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

export * from './auth-schema';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // The whole ArchDoc as one JSON blob. Typed unknown on purpose: every read
    // must go through migrate() before the app can use it.
    doc: text('doc', { mode: 'json' }).$type<unknown>().notNull(),
    // Bumped on every write; clients send the revision they edited (If-Match)
    // and a stale one is rejected with 409 instead of overwriting.
    revision: integer('revision').notNull().default(1),
    shareToken: text('share_token').unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('projects_owner_idx').on(t.ownerId)],
);

/**
 * A change the AI or an MCP client suggests. It never touches the doc until
 * the owner approves it; applying replays the chosen ops on the doc as it is
 * then, so it survives edits made in between.
 */
export const proposals = sqliteTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['chat', 'mcp', 'import', 'snapshot'] }).notNull(),
    summary: text('summary').notNull(),
    // Op[]; parsed with OpSchema on the way in and again before applying.
    ops: text('ops', { mode: 'json' }).$type<unknown>().notNull(),
    // Issues the ops would add, computed against the base revision.
    newIssues: text('new_issues', { mode: 'json' }).$type<unknown>().notNull(),
    baseRevision: integer('base_revision').notNull(),
    status: text('status', { enum: ['pending', 'applied', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull(),
  },
  (t) => [index('proposals_project_idx').on(t.projectId)],
);

/**
 * A named copy of a project's saved doc. Snapshots never change: comparing
 * or restoring goes through a proposal, forking makes a new project.
 */
export const snapshots = sqliteTable(
  'snapshots',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    doc: text('doc', { mode: 'json' }).$type<unknown>().notNull(),
    // The project revision it was taken at.
    revision: integer('revision').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull(),
  },
  (t) => [index('snapshots_project_idx').on(t.projectId)],
);

/** The assistant chat of a project, as plain text turns. */
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    /** The proposal this reply produced, if any. */
    proposalId: text('proposal_id').references(() => proposals.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull(),
  },
  (t) => [index('chat_messages_project_idx').on(t.projectId, t.createdAt)],
);
