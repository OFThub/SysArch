import type { ApiType, Proposal } from '@sysarch/server/api';
import { newId, type ArchDoc, type Op, type OpError } from '@sysarch/shared';
import { apiKeyClient } from '@better-auth/api-key/client';
import { createAuthClient } from 'better-auth/react';
import { hc } from 'hono/client';
import type { Comment, Target } from '../comments/threads';
import type { SaveFn } from '../sync/autosave';

/**
 * This tab's id. The server echoes it on the live events a request causes, so
 * the tab can tell its own saves from someone else's.
 */
export const CLIENT_ID = newId();

/** Typed client generated from the server's route chain; only types cross the package line. */
export const api = hc<ApiType>('/api', { headers: { 'X-Client-Id': CLIENT_ID } });

/** Better Auth on the same origin (/api/auth), proxied to the server in dev. */
export const authClient = createAuthClient({ plugins: [apiKeyClient()] });

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

export async function listProposals(projectId: string): Promise<Proposal[]> {
  const res = await api.projects[':id'].proposals.$get({ param: { id: projectId } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()).proposals as Proposal[];
}

/** Files ops for review in the proposals tab; the new proposal's id, or the server's reason. */
export async function createProposal(
  projectId: string,
  json: { summary: string; ops: Op[]; source: 'import' },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const res = await api.projects[':id'].proposals.$post({ param: { id: projectId }, json });
  const body = (await res.json().catch(() => ({}))) as { proposal?: Proposal; error?: string };
  return res.ok && body.proposal
    ? { ok: true, id: body.proposal.id }
    : { ok: false, error: body.error ?? `http ${res.status}` };
}

const share = api.projects[':id'].share;

/** The project's read-only link (token null when not shared) and whether it takes comments. */
export type ShareLink = { token: string | null; comments: boolean };

export async function getShare(projectId: string): Promise<ShareLink> {
  const res = await share.$get({ param: { id: projectId } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as ShareLink;
}

export async function createShare(projectId: string): Promise<ShareLink> {
  const res = await share.$post({ param: { id: projectId } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as ShareLink;
}

export async function setShareComments(projectId: string, comments: boolean): Promise<ShareLink> {
  const res = await share.$patch({ param: { id: projectId }, json: { comments } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as ShareLink;
}

export async function revokeShare(projectId: string): Promise<boolean> {
  return (await share.$delete({ param: { id: projectId } })).ok;
}

export type Shared = { name: string; doc: ArchDoc; comments: boolean };

/** A shared design, read without a session; null when the link is unknown or revoked. */
export async function readShared(token: string): Promise<Shared | null> {
  const res = await api.share[':token'].$get({ param: { token } });
  return res.ok ? ((await res.json()) as Shared) : null;
}

/**
 * Where comments are read and written: the owner's project, or a share link
 * (read by anyone, written with a session).
 */
export type CommentSource = { project: string } | { token: string };
export type NewComment = { body: string } & ({ target: Target } | { parentId: string });
/** Why a write failed, for the message the user sees. */
export type CommentError = 'rate_limited' | 'failed';

const projectComments = api.projects[':id'].comments;
const linkComments = api.share[':token'].comments;

export async function listComments(source: CommentSource): Promise<Comment[]> {
  const res =
    'project' in source
      ? await projectComments.$get({ param: { id: source.project } })
      : await linkComments.$get({ param: { token: source.token } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()).comments as unknown as Comment[];
}

export async function addComment(
  source: CommentSource,
  json: NewComment,
): Promise<CommentError | null> {
  const res =
    'project' in source
      ? await projectComments.$post({ param: { id: source.project }, json })
      : await linkComments.$post({ param: { token: source.token }, json });
  return res.ok ? null : res.status === 429 ? 'rate_limited' : 'failed';
}

export async function removeComment(source: CommentSource, id: string): Promise<boolean> {
  const res =
    'project' in source
      ? await projectComments[':cid'].$delete({ param: { id: source.project, cid: id } })
      : await linkComments[':cid'].$delete({ param: { token: source.token, cid: id } });
  return res.ok;
}

/** Owner only: resolving is per thread, by its root comment. */
export async function resolveThread(
  projectId: string,
  id: string,
  resolved: boolean,
): Promise<boolean> {
  const res = await projectComments[':cid'].$patch({
    param: { id: projectId, cid: id },
    json: { resolved },
  });
  return res.ok;
}

export type Snapshot = { id: string; name: string; revision: number; createdAt: string };

const snaps = api.projects[':id'].snapshots;
const snap = snaps[':sid'];

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  const res = await snaps.$get({ param: { id: projectId } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()).snapshots as unknown as Snapshot[];
}

export async function takeSnapshot(projectId: string, name: string): Promise<boolean> {
  return (await snaps.$post({ param: { id: projectId }, json: { name } })).ok;
}

/** A proposal back to the snapshot: its id, `null` when nothing differs, or the reason it failed. */
export async function restoreSnapshot(
  projectId: string,
  snapshotId: string,
  summary: string,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const res = await snap.restore.$post({
    param: { id: projectId, sid: snapshotId },
    json: { summary },
  });
  const body = (await res.json().catch(() => ({}))) as {
    proposal?: Proposal | null;
    error?: string;
  };
  return res.ok
    ? { ok: true, id: body.proposal?.id ?? null }
    : { ok: false, error: body.error ?? `http ${res.status}` };
}

/** Copies a snapshot into a new project; its id. */
export async function forkSnapshot(
  projectId: string,
  snapshotId: string,
  name: string,
): Promise<string | null> {
  const res = await snap.fork.$post({ param: { id: projectId, sid: snapshotId }, json: { name } });
  return res.ok ? ((await res.json()) as { id: string }).id : null;
}

export async function deleteSnapshot(projectId: string, snapshotId: string): Promise<boolean> {
  return (await snap.$delete({ param: { id: projectId, sid: snapshotId } })).ok;
}

export type ApplyResult =
  | { ok: true; revision: number; doc: ArchDoc }
  /** Ops the current doc no longer allows, by their index in the proposal. */
  | { ok: false; conflicts: OpError[] }
  | { ok: false; error: string };

export async function applyProposal(
  projectId: string,
  proposalId: string,
  accept: number[],
): Promise<ApplyResult> {
  const res = await api.projects[':id'].proposals[':pid'].apply.$post({
    param: { id: projectId, pid: proposalId },
    json: { accept },
  });
  if (res.ok) {
    const body = await res.json();
    return { ok: true, revision: body.revision, doc: body.doc as ArchDoc };
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; errors?: OpError[] };
  if (body.error === 'ops_conflict') return { ok: false, conflicts: body.errors ?? [] };
  return { ok: false, error: body.error ?? `http ${res.status}` };
}

export async function rejectProposal(projectId: string, proposalId: string): Promise<boolean> {
  const res = await api.projects[':id'].proposals[':pid'].reject.$post({
    param: { id: projectId, pid: proposalId },
  });
  return res.ok;
}

/** Loads a project; `null` when it does not exist or belongs to someone else. */
export async function loadProject(id: string): Promise<ProjectData | null> {
  const res = await api.projects[':id'].$get({ param: { id } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`http ${res.status}`);
  const p = await res.json();
  // The server migrated and validated it; JSON drops nothing an ArchDoc needs.
  return { id: p.id, revision: p.revision, doc: p.doc as ArchDoc };
}
