import { seraIot } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { buildFlow } from './viewModel';

const doc = seraIot();

describe('buildFlow', () => {
  it('shows a domain tab with its cross-domain neighbours as proxies', () => {
    const { nodes, edges } = buildFlow(doc, 'hardware');
    const proxies = nodes.filter((n) => n.data.proxy).map((n) => n.id);
    expect(proxies).toEqual(['mqtt']);
    expect(nodes.filter((n) => !n.data.proxy).every((n) => n.data.node.domain === 'hardware')).toBe(
      true,
    );
    expect(edges.map((e) => e.id)).toContain('e-publish');
  });

  it('omits edges between two proxies', () => {
    // In the AI tab, db and api are both proxies; their SQL link belongs to fullstack.
    const { edges } = buildFlow(doc, 'ai');
    expect(edges.map((e) => e.id)).not.toContain('e-store');
  });

  it('frames every domain in the overview and has no proxies', () => {
    const { nodes, frames } = buildFlow(doc, 'overview');
    expect(nodes).toHaveLength(doc.nodes.length);
    expect(nodes.some((n) => n.data.proxy)).toBe(false);
    expect(frames.map((f) => f.domain).sort()).toEqual(['ai', 'fullstack', 'hardware']);
  });

  it('stacks unpositioned nodes in a column right of the placed ones', () => {
    const d = seraIot();
    d.views.find((v) => v.id === 'hardware')!.positions = { esp32: { x: 100, y: 0 } };
    const pos = buildFlow(d, 'hardware').nodes.map((n) => n.position);
    expect(pos[0]).toEqual({ x: 100, y: 0 });
    expect(pos.slice(1).every((p) => p.x === 420)).toBe(true);
    expect(new Set(pos.slice(1).map((p) => p.y)).size).toBe(pos.length - 1);
  });

  it('returns an empty model for an unknown view', () => {
    expect(buildFlow(doc, 'nope')).toEqual({ nodes: [], edges: [], frames: [] });
  });
});
