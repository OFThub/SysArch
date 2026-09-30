import type { ApiType } from '@sysarch/server/api';
import type { ArchDoc } from '@sysarch/shared';
import { createAuthClient } from 'better-auth/react';
import { hc } from 'hono/client';
import type { SaveFn } from '../sync/autosave';

/** Typed client generated from the server's route chain; only types cross the package line. */
export const api = hc<ApiType>('/api');

/** Better Auth on the same origin (/api/auth), proxied to the server in dev. */
export const authClient = createAuthClient();

export const saveProject: SaveFn = async (id, revision, doc, { keepalive }) => {
  const res = await api.projects[':id'].$put(
    { param: { id }, json: { doc } },
    { headers: { 'If-Match': `"${revision}"` }, init: { keepalive } },
  );
  if (res.ok) return { ok: true, revision: (await res.json()).revision };
  if (res.status === 409) {
    const body = (await res.json()) as { revision: number };
    return { ok: false, conflict: body.revision };
  }
  return { ok: false, error: `http ${res.status}` };
};

export type ProjectData = { id: string; revision: number; doc: ArchDoc };

/** Loads a project; `null` when it does not exist or belongs to someone else. */
export async function loadProject(id: string): Promise<ProjectData | null> {
  const res = await api.projects[':id'].$get({ param: { id } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`http ${res.status}`);
  const p = await res.json();
  // The server migrated and validated it; JSON drops nothing an ArchDoc needs.
  return { id: p.id, revision: p.revision, doc: p.doc as ArchDoc };
}
