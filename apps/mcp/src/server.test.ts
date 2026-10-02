import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { applyOps, newIssues, seraIot, type Op } from '@sysarch/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, httpApi, type SysarchApi } from './api';
import { createSysarchServer } from './server';

/** A SysArch with one project, doing what the server does for proposals. */
function fakeApi(): SysarchApi & { proposed: Op[][] } {
  const doc = seraIot();
  doc.nodes.push({ id: 'lonely', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} });
  const proposed: Op[][] = [];
  const getProject = async (id: string) => {
    if (id !== 'p1') throw new ApiError('No such project, or it belongs to another account.');
    return { id, name: 'Sera', revision: 1, doc };
  };
  return {
    proposed,
    listProjects: async () => [{ id: 'p1', name: 'Sera', updatedAt: '2026-10-01' }],
    getProject,
    async propose(id, _summary, ops) {
      const r = applyOps((await getProject(id)).doc, ops);
      if (r.errors.length) return { ok: false, errors: r.errors };
      proposed.push(ops);
      return { ok: true, proposal: { id: 'prop1', newIssues: newIssues(doc, r.doc) } };
    },
  };
}

async function connect(api: SysarchApi) {
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await createSysarchServer(api).connect(serverEnd);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientEnd);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as {
      content: { type: string; text: string }[];
      isError?: boolean;
    };
    return { text: r.content.map((c) => c.text).join('\n'), isError: r.isError ?? false };
  };
  return { client, call };
}

describe('sysarch mcp server', () => {
  it('offers the five tools', async () => {
    const { client } = await connect(fakeApi());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'export',
      'get_architecture',
      'list_issues',
      'list_projects',
      'propose_changes',
    ]);
  });

  it('reads the architecture, its issues and generated files', async () => {
    const { call } = await connect(fakeApi());
    expect((await call('list_projects')).text).toContain('p1  Sera');
    expect((await call('get_architecture', { projectId: 'p1' })).text).toContain('Sera API');
    expect(
      JSON.parse((await call('get_architecture', { projectId: 'p1', format: 'json' })).text),
    ).toHaveProperty('components');

    const issues = (await call('list_issues', { projectId: 'p1' })).text;
    expect(issues).toContain('[info] “Redis” is not connected to anything.');
    expect(issues).toContain('(lonely)');

    const files = (await call('export', { projectId: 'p1' })).text.split('\n');
    expect(files).toEqual(expect.arrayContaining(['ARCHITECTURE.md', 'docker-compose.yml']));
    expect((await call('export', { projectId: 'p1', path: 'docker-compose.yml' })).text).toContain(
      'services:',
    );
    expect(await call('export', { projectId: 'p1', path: 'nope.txt' })).toMatchObject({
      isError: true,
    });
  });

  it('proposes changes and reports what they would break', async () => {
    const api = fakeApi();
    const { call } = await connect(api);
    const r = await call('propose_changes', {
      projectId: 'p1',
      summary: 'Bir kuyruk ekle',
      ops: [
        { op: 'add_node', node: { id: 'q', domain: 'fullstack', type: 'queue', label: 'Kuyruk' } },
      ],
    });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('Proposal prop1 with 1 change(s) is waiting for approval');
    expect(r.text).toContain('“Kuyruk” is not connected to anything.');
    expect(api.proposed).toHaveLength(1);
  });

  it('returns rejected and malformed ops as errors the model can fix', async () => {
    const { call } = await connect(fakeApi());
    const rejected = await call('propose_changes', {
      projectId: 'p1',
      summary: 'x',
      ops: [{ op: 'remove_node', id: 'ghost' }],
    });
    expect(rejected).toEqual({
      isError: true,
      text: 'No proposal was created. Rejected ops:\nop 0: unknown node "ghost"',
    });
    const malformed = await call('propose_changes', {
      projectId: 'p1',
      summary: 'x',
      ops: [{ op: 'drop' }],
    });
    expect(malformed.isError).toBe(true);
    expect((await call('list_issues', { projectId: 'other' })).isError).toBe(true);
  });
});

describe('httpApi', () => {
  it('sends the key, maps rejected ops and explains failures', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(new Headers(init?.headers).get('x-api-key')).toBe('sysarch_k');
      if (url.endsWith('/proposals'))
        return Response.json(
          { error: 'invalid_ops', errors: [{ index: 0, message: 'bad' }] },
          { status: 422 },
        );
      return new Response(null, { status: 401 });
    });
    const api = httpApi('http://sysarch.test', 'sysarch_k', fetchFn);

    expect(await api.propose('p1', 's', [])).toEqual({
      ok: false,
      errors: [{ index: 0, message: 'bad' }],
    });
    await expect(api.listProjects()).rejects.toThrow(/rejected the API key/);
    expect(String(fetchFn.mock.calls[1]![0])).toBe('http://sysarch.test/api/projects');
  });
});
