import type { ArchDoc } from '@sysarch/shared';
import { tr } from '../i18n/tr';

/** A comment as the server sends it; times are ISO strings. */
export type Comment = {
  id: string;
  parentId: string | null;
  targetKind: 'project' | 'node' | 'edge';
  targetId: string | null;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
  author: string;
  canDelete: boolean;
};
export type Thread = { root: Comment; replies: Comment[] };
export type Target = { kind: 'project' } | { kind: 'node' | 'edge'; id: string };

/** Comments, oldest first, grouped into threads in the order they started. */
export function threadsOf(comments: Comment[]): Thread[] {
  const threads = new Map<string, Thread>();
  for (const c of comments)
    if (!c.parentId) threads.set(c.id, { root: c, replies: [] });
    else threads.get(c.parentId)?.replies.push(c);
  return [...threads.values()];
}

/** Open threads per component, for the mark on the canvas. */
export function openByNode(comments: Comment[]): Record<string, number> {
  const open: Record<string, number> = {};
  for (const c of comments)
    if (!c.parentId && !c.resolvedAt && c.targetKind === 'node' && c.targetId)
      open[c.targetId] = (open[c.targetId] ?? 0) + 1;
  return open;
}

/** What a new thread is about: the one selected component or link, else the whole design. */
export function targetOf(selection: { nodeIds: string[]; edgeIds: string[] }): Target {
  const { nodeIds, edgeIds } = selection;
  if (nodeIds.length === 1 && !edgeIds.length) return { kind: 'node', id: nodeIds[0]! };
  if (edgeIds.length === 1 && !nodeIds.length) return { kind: 'edge', id: edgeIds[0]! };
  return { kind: 'project' };
}

/** A thread's subject in words; `present` is false once the design no longer has it. */
export function targetLabel(
  doc: ArchDoc,
  t: { targetKind: Comment['targetKind']; targetId: string | null },
): { text: string; present: boolean } {
  const label = (id: string) => doc.nodes.find((n) => n.id === id)?.label;
  if (t.targetKind === 'project') return { text: tr.comments.project, present: true };
  if (t.targetKind === 'node') {
    const text = label(t.targetId ?? '');
    return text ? { text, present: true } : { text: tr.comments.removed, present: false };
  }
  const edge = doc.edges.find((e) => e.id === t.targetId);
  return edge
    ? { text: tr.comments.link(label(edge.source) ?? '', label(edge.target) ?? ''), present: true }
    : { text: tr.comments.removed, present: false };
}

const lastActivity = (t: Thread) => (t.replies.at(-1) ?? t.root).createdAt;

/**
 * Open threads and resolved ones, each in reading order. Open: threads
 * about what is selected come first, then the most recently active, so a
 * new reply surfaces. Resolved: most recently resolved first.
 */
export function orderThreads(threads: Thread[], focus: Target) {
  const about = (t: Thread) =>
    focus.kind !== 'project' && t.root.targetKind === focus.kind && t.root.targetId === focus.id;
  const open = threads
    .filter((t) => !t.root.resolvedAt)
    .sort(
      (a, b) =>
        Number(about(b)) - Number(about(a)) || lastActivity(b).localeCompare(lastActivity(a)),
    );
  const resolved = threads
    .filter((t) => t.root.resolvedAt)
    .sort((a, b) => b.root.resolvedAt!.localeCompare(a.root.resolvedAt!));
  return { open, resolved };
}
