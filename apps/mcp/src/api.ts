import type { ArchDoc, Issue, Op, OpError } from '@sysarch/shared';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export type ProposeResult =
  | { ok: true; proposal: { id: string; newIssues: Issue[] } }
  /** Ops the current doc does not allow, with the reason for each. */
  | { ok: false; errors: OpError[] };

/** What the MCP tools need from SysArch; the server stays the only writer. */
export interface SysarchApi {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<{ id: string; name: string; revision: number; doc: ArchDoc }>;
  propose(id: string, summary: string, ops: Op[]): Promise<ProposeResult>;
}

/** A failure explained in words the calling model can act on. */
export class ApiError extends Error {}

const explain = (status: number) =>
  status === 401
    ? 'SysArch rejected the API key. Create a new one under "API anahtarları" and update SYSARCH_API_KEY.'
    : status === 404
      ? 'No such project, or it belongs to another account. Call list_projects for valid ids.'
      : status === 429
        ? 'Too many requests for this API key. Wait a minute and try again.'
        : `SysArch API answered HTTP ${status}.`;

/** The REST client, authenticated as the key's owner. */
export function httpApi(
  baseUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): SysarchApi {
  const call = async (path: string, init: RequestInit = {}) =>
    fetchFn(new URL(`/api${path}`, baseUrl), {
      ...init,
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    });
  const json = async <T>(res: Response) => {
    if (!res.ok) throw new ApiError(explain(res.status));
    return (await res.json()) as T;
  };

  return {
    async listProjects() {
      return (await json<{ projects: ProjectSummary[] }>(await call('/projects'))).projects;
    },
    async getProject(id) {
      // The server migrates and validates every doc it returns.
      return json(await call(`/projects/${encodeURIComponent(id)}`));
    },
    async propose(id, summary, ops) {
      const res = await call(`/projects/${encodeURIComponent(id)}/proposals`, {
        method: 'POST',
        body: JSON.stringify({ summary, ops }),
      });
      if (res.status === 422) {
        const body = (await res.json()) as { errors: OpError[] };
        return { ok: false, errors: body.errors };
      }
      const body = await json<{ proposal: { id: string; newIssues: Issue[] } }>(res);
      return { ok: true, proposal: body.proposal };
    },
  };
}
