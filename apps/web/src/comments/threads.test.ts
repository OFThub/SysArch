import { seraIot } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import {
  openByNode,
  orderThreads,
  targetLabel,
  targetOf,
  threadsOf,
  type Comment,
} from './threads';

let n = 0;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 8, 12, minute)).toISOString();
const comment = (over: Partial<Comment>): Comment => ({
  id: `c${++n}`,
  parentId: null,
  targetKind: 'project',
  targetId: null,
  body: 'x',
  resolvedAt: null,
  createdAt: at(0),
  author: 'Ada',
  canDelete: true,
  ...over,
});

describe('comment threads', () => {
  it('groups replies under their thread and counts open threads per component', () => {
    const esp = comment({ id: 'a', targetKind: 'node', targetId: 'esp32' });
    const done = comment({ id: 'b', targetKind: 'node', targetId: 'esp32', resolvedAt: at(5) });
    const reply = comment({ id: 'r', parentId: 'a', targetKind: 'node', targetId: 'esp32' });
    const list = [esp, done, reply, comment({ id: 'p' })];

    expect(threadsOf(list).map((t) => [t.root.id, t.replies.map((r) => r.id)])).toEqual([
      ['a', ['r']],
      ['b', []],
      ['p', []],
    ]);
    // Resolved threads, replies and threads about the whole design leave no mark.
    expect(openByNode(list)).toEqual({ esp32: 1 });
  });

  it('takes the subject of a new thread from a single selected item', () => {
    expect(targetOf({ nodeIds: ['esp32'], edgeIds: [] })).toEqual({ kind: 'node', id: 'esp32' });
    expect(targetOf({ nodeIds: [], edgeIds: ['e1'] })).toEqual({ kind: 'edge', id: 'e1' });
    expect(targetOf({ nodeIds: ['a', 'b'], edgeIds: [] })).toEqual({ kind: 'project' });
    expect(targetOf({ nodeIds: ['a'], edgeIds: ['e1'] })).toEqual({ kind: 'project' });
  });

  it('names what a thread is about, and says when it is gone', () => {
    const doc = seraIot();
    const edge = doc.edges[0]!;
    const from = doc.nodes.find((x) => x.id === edge.source)!.label;
    expect(targetLabel(doc, { targetKind: 'node', targetId: 'esp32' })).toEqual({
      text: doc.nodes.find((x) => x.id === 'esp32')!.label,
      present: true,
    });
    expect(targetLabel(doc, { targetKind: 'edge', targetId: edge.id }).text).toContain(from);
    expect(targetLabel(doc, { targetKind: 'node', targetId: 'gone' }).present).toBe(false);
    expect(targetLabel(doc, { targetKind: 'project', targetId: null }).present).toBe(true);
  });

  it('puts threads about the selection first, then the most recently active', () => {
    const old = comment({ id: 'old', createdAt: at(1) });
    const fresh = comment({ id: 'fresh', createdAt: at(2) });
    const revived = comment({ id: 'revived', createdAt: at(0) });
    const late = comment({ id: 'late', parentId: 'revived', createdAt: at(9) });
    const mine = comment({ id: 'mine', targetKind: 'node', targetId: 'esp32', createdAt: at(0) });
    const shut1 = comment({ id: 'shut1', resolvedAt: at(3) });
    const shut2 = comment({ id: 'shut2', resolvedAt: at(4) });
    const threads = threadsOf([old, fresh, revived, mine, shut1, shut2, late]);

    const plain = orderThreads(threads, { kind: 'project' });
    expect(plain.open.map((t) => t.root.id)).toEqual(['revived', 'fresh', 'old', 'mine']);
    expect(plain.resolved.map((t) => t.root.id)).toEqual(['shut2', 'shut1']);
    const focused = orderThreads(threads, { kind: 'node', id: 'esp32' });
    expect(focused.open[0]!.root.id).toBe('mine');
  });
});
