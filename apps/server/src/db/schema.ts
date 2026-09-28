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
