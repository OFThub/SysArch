import { ArchDocSchema, SCHEMA_VERSION, type ArchDoc } from './schema';

export type RawDoc = Record<string, unknown>;

/** Upgrades a doc from version N to N+1. Keyed by N. */
export type Migration = (doc: RawDoc) => RawDoc;

/**
 * Add an entry here whenever SCHEMA_VERSION is bumped, e.g.
 * `1: (doc) => ({ ...doc, newField: [] })` upgrades v1 docs to v2.
 */
export const MIGRATIONS: Record<number, Migration> = {};

/** Runs migration steps until `doc` reaches `target`. Docs without a version count as v1. */
export function upgrade(
  input: unknown,
  migrations: Record<number, Migration>,
  target: number,
): RawDoc {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('architecture doc must be a JSON object');
  }
  let doc = input as RawDoc;
  let version = typeof doc.version === 'number' ? doc.version : 1;

  if (version > target) {
    throw new Error(`doc version ${version} is newer than supported version ${target}`);
  }
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new Error(`no migration from version ${version}`);
    version += 1;
    doc = { ...step(doc), version };
  }
  return { ...doc, version };
}

/**
 * Brings any stored or imported doc up to the current schema and validates it.
 * Runs on every read, so old projects keep opening after the schema grows.
 * Throws on future versions, missing migration steps and invalid docs.
 */
export function migrate(input: unknown): ArchDoc {
  return ArchDocSchema.parse(upgrade(input, MIGRATIONS, SCHEMA_VERSION));
}
