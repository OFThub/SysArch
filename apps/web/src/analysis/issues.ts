import { describeIssue, RULES, validate, type ArchDoc, type Issue } from '@sysarch/shared';
import { useDeferredValue, useMemo } from 'react';
import { buildFlow } from '../canvas/viewModel';
import { useCatalog, useEditor } from '../store';

/**
 * All issues for the current doc. Validation runs on a deferred copy of the
 * doc, so typing stays responsive and results catch up a frame later.
 */
export function useIssues(): Issue[] {
  const doc = useDeferredValue(useEditor((s) => s.doc));
  const catalog = useCatalog();
  return useMemo(() => validate(doc, catalog), [doc, catalog]);
}

export const issueText = (issue: Issue) => describeIssue(issue, RULES, 'tr');

const RANK = { error: 0, warning: 1, info: 2 } as const;
export type IssueMark = { severity: Issue['severity']; items: Issue[] };

/** Worst severity and count per node and per edge, for canvas badges. */
export function issueIndex(issues: Issue[]) {
  const mark = (map: Map<string, IssueMark>, id: string, i: Issue) => {
    const cur = map.get(id);
    if (!cur) return void map.set(id, { severity: i.severity, items: [i] });
    cur.items.push(i);
    if (RANK[i.severity] < RANK[cur.severity]) cur.severity = i.severity;
  };
  const nodes = new Map<string, IssueMark>();
  const edges = new Map<string, IssueMark>();
  for (const i of issues) {
    // Edge issues badge the edge; node-only issues badge the node.
    if (i.edgeIds.length) for (const id of i.edgeIds) mark(edges, id, i);
    else for (const id of i.nodeIds) mark(nodes, id, i);
  }
  return { nodes, edges };
}

/**
 * Where to show an issue: the current view if it contains every node
 * involved, otherwise the overview, which shows every top-level node.
 */
export function viewForIssue(
  doc: ArchDoc,
  activeViewId: string,
  issue: Pick<Issue, 'nodeIds'>,
): string {
  const shown = new Set(buildFlow(doc, activeViewId).nodes.map((n) => n.id));
  return issue.nodeIds.every((id) => shown.has(id)) ? activeViewId : 'overview';
}
