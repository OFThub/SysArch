import { McpServer } from '@modelcontextprotocol/server';
import {
  describeIssue,
  effectiveCatalog,
  exportArchitecture,
  generateCode,
  OpSchema,
  RULES,
  validate,
  type ArchDoc,
  type Op,
} from '@sysarch/shared';
import { z } from 'zod';
import type { SysarchApi } from './api';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] });

/** Every failure goes back to the model as a readable, recoverable tool error. */
const guarded =
  <A>(run: (args: A) => Promise<ToolResult>) =>
  async (args: A): Promise<ToolResult> => {
    try {
      return await run(args);
    } catch (e) {
      return { ...text(e instanceof Error ? e.message : String(e)), isError: true };
    }
  };

const Project = z.object({
  projectId: z.string().min(1).describe('Project id from list_projects'),
});

const issueLines = (doc: ArchDoc) =>
  validate(doc, effectiveCatalog(doc.customTypes)).map((issue) => {
    const { message, hint } = describeIssue(issue, RULES, 'en');
    const where = [...issue.nodeIds, ...issue.edgeIds].join(', ');
    return `[${issue.severity}] ${message}${hint ? ` Fix: ${hint}` : ''}${where ? ` (${where})` : ''}`;
  });

/**
 * SysArch over MCP. Reading tools compute from the project doc with the same
 * shared code the editor uses; the only write is a proposal, which waits for
 * the owner's approval in the editor.
 */
export function createSysarchServer(api: SysarchApi) {
  const server = new McpServer({ name: 'sysarch', version: '0.2.0' });

  server.registerTool(
    'list_projects',
    { description: 'List your SysArch projects with their ids.', inputSchema: z.object({}) },
    guarded(async () => {
      const projects = await api.listProjects();
      if (projects.length === 0) return text('No projects yet.');
      return text(projects.map((p) => `${p.id}  ${p.name}  (updated ${p.updatedAt})`).join('\n'));
    }),
  );

  server.registerTool(
    'get_architecture',
    {
      description:
        'A project as ARCHITECTURE.md (default) or compact architecture.json: components with all ' +
        'properties, links with protocols, pins and payloads, cross-domain interfaces and open issues.',
      inputSchema: Project.extend({ format: z.enum(['markdown', 'json']).default('markdown') }),
    },
    guarded(async ({ projectId, format }: { projectId: string; format: 'markdown' | 'json' }) => {
      const { doc } = await api.getProject(projectId);
      const files = exportArchitecture(doc, effectiveCatalog(doc.customTypes));
      const name = format === 'json' ? 'architecture.json' : 'ARCHITECTURE.md';
      return text(files.find((f) => f.path === name)!.content);
    }),
  );

  server.registerTool(
    'list_issues',
    {
      description:
        'Validation and simulation findings for a project: pin voltage mismatches, bus conflicts, ' +
        'missing pins, protocol mismatches, overloads, power budget, design smells.',
      inputSchema: Project,
    },
    guarded(async ({ projectId }: { projectId: string }) => {
      const { doc } = await api.getProject(projectId);
      const lines = issueLines(doc);
      return text(lines.length ? lines.join('\n') : 'No issues.');
    }),
  );

  server.registerTool(
    'export',
    {
      description:
        'Files generated from a project: docker-compose.yml, OpenAPI specs, MQTT config and topics, ' +
        'pins.h per microcontroller, ARCHITECTURE.md and architecture.json. Without a path, lists them.',
      inputSchema: Project.extend({
        path: z.string().optional().describe('A file path from the list, to get its content'),
      }),
    },
    guarded(async ({ projectId, path }: { projectId: string; path?: string }) => {
      const { doc } = await api.getProject(projectId);
      const catalog = effectiveCatalog(doc.customTypes);
      const files = [...exportArchitecture(doc, catalog), ...generateCode(doc, catalog)];
      if (!path) return text(files.map((f) => f.path).join('\n'));
      const file = files.find((f) => f.path === path);
      if (!file)
        throw new Error(`No file "${path}". Available:\n${files.map((f) => f.path).join('\n')}`);
      return text(file.content);
    }),
  );

  server.registerTool(
    'propose_changes',
    {
      description:
        'Propose architecture changes as ops (add/update/remove nodes and edges, set flows and ' +
        'boundaries). Nothing is applied: the owner reviews the proposal in the SysArch editor and ' +
        'approves all or part of it. Ops that do not apply come back with reasons; fix them and ' +
        'call again. Read get_architecture first for ids, types and pins.',
      inputSchema: Project.extend({
        summary: z
          .string()
          .min(1)
          .max(2000)
          .describe('What the change does and why, for the reviewer'),
        ops: z.array(OpSchema).min(1).max(500),
      }),
    },
    guarded(
      async ({ projectId, summary, ops }: { projectId: string; summary: string; ops: Op[] }) => {
        const r = await api.propose(projectId, summary, ops);
        if (!r.ok) {
          const lines = r.errors.map((e) => `op ${e.index}: ${e.message}`);
          return {
            ...text(`No proposal was created. Rejected ops:\n${lines.join('\n')}`),
            isError: true,
          };
        }
        const issues = r.proposal.newIssues.map(
          (i) => `- [${i.severity}] ${describeIssue(i, RULES, 'en').message}`,
        );
        return text(
          [
            `Proposal ${r.proposal.id} with ${ops.length} change(s) is waiting for approval in the SysArch editor.`,
            issues.length
              ? `It would introduce:\n${issues.join('\n')}`
              : 'It introduces no new issues.',
          ].join('\n'),
        );
      },
    ),
  );

  return server;
}
