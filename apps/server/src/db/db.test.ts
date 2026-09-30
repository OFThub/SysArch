import { createEmptyDoc } from '@sysarch/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDb, schema } from './index';

function seedUser(db: ReturnType<typeof openDb>, id: string) {
  db.insert(schema.user)
    .values({ id, name: id, email: `${id}@example.test`, updatedAt: new Date() })
    .run();
}

describe('database', () => {
  it('applies migrations to a fresh database', () => {
    const db = openDb(':memory:');
    expect(db.select().from(schema.projects).all()).toEqual([]);
  });

  it('stores the doc as JSON and starts at revision 1', () => {
    const db = openDb(':memory:');
    seedUser(db, 'u1');
    const doc = createEmptyDoc('Demo');
    db.insert(schema.projects).values({ id: 'p1', ownerId: 'u1', name: 'Demo', doc }).run();
    const row = db.select().from(schema.projects).where(eq(schema.projects.id, 'p1')).get()!;
    expect(row.doc).toEqual(doc);
    expect(row.revision).toBe(1);
  });

  it("deletes a user's projects with the user (foreign keys are on)", () => {
    const db = openDb(':memory:');
    seedUser(db, 'u1');
    db.insert(schema.projects)
      .values({ id: 'p1', ownerId: 'u1', name: 'Demo', doc: createEmptyDoc('Demo') })
      .run();
    db.delete(schema.user).where(eq(schema.user.id, 'u1')).run();
    expect(db.select().from(schema.projects).all()).toEqual([]);
  });

  it('rejects a project owned by a user that does not exist', () => {
    const db = openDb(':memory:');
    expect(() =>
      db.insert(schema.projects).values({ id: 'p1', ownerId: 'ghost', name: 'x', doc: {} }).run(),
    ).toThrow(/FOREIGN KEY/);
  });
});
