import { describe, expect, it } from 'vitest';
import { removeElements } from './edit';
import { applyOps, diffDocs, OpSchema } from './ops';
import type { ArchDoc } from './schema';
import { seraIot } from './templates';

// Ops append what they add, so compare docs as sets of items, not arrays.
const byId = <T extends { id: string }>(items: T[]) =>
  [...items].sort((x, y) => x.id.localeCompare(y.id));
const canon = (doc: ArchDoc) => ({
  ...doc,
  nodes: byId(doc.nodes),
  edges: byId(doc.edges),
  flows: byId(doc.flows),
  boundaries: byId(doc.boundaries),
});

describe('applyOps', () => {
  it('adds, patches and removes without touching the input', () => {
    const doc = seraIot();
    const { doc: out, errors } = applyOps(doc, [
      {
        op: 'add_node',
        node: { id: 'cache', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} },
        positions: { fullstack: { x: 10, y: 20 } },
      },
      {
        op: 'add_edge',
        edge: { id: 'e-cache', source: 'api', target: 'cache', protocol: 'TCP', props: {} },
      },
      { op: 'update_node', id: 'api', patch: { label: 'Sera API v2', notes: 'Hono' } },
      { op: 'remove_node', id: 'dashboard' },
    ]);

    expect(errors).toEqual([]);
    expect(out.nodes.find((n) => n.id === 'api')).toMatchObject({
      label: 'Sera API v2',
      notes: 'Hono',
    });
    expect(out.views.find((v) => v.id === 'fullstack')!.positions.cache).toEqual({ x: 10, y: 20 });
    // Removing a node takes its edges with it.
    expect(out.edges.filter((e) => [e.source, e.target].includes('dashboard'))).toEqual([]);
    expect(doc.nodes.some((n) => n.id === 'dashboard')).toBe(true);
  });

  it('merges props key by key and clears with null', () => {
    const { doc } = applyOps(seraIot(), [
      { op: 'update_node', id: 'api', patch: { props: { port: 8080, auth: 'jwt' }, notes: 'x' } },
      { op: 'update_node', id: 'api', patch: { props: { auth: null }, notes: null } },
    ]);
    const api = doc.nodes.find((n) => n.id === 'api')!;
    expect(api.props.port).toBe(8080);
    expect(api.props).not.toHaveProperty('auth');
    expect(api).not.toHaveProperty('notes');
  });

  it('rejects an invalid op with its reason and keeps applying the rest', () => {
    const { doc, errors } = applyOps(seraIot(), [
      {
        op: 'add_edge',
        edge: { id: 'e-x', source: 'api', target: 'ghost', protocol: 'HTTP', props: {} },
      },
      { op: 'update_node', id: 'ghost', patch: { label: 'x' } },
      {
        op: 'add_node',
        node: { id: 'api', domain: 'fullstack', type: 'api', label: 'Twin', props: {} },
      },
      { op: 'update_node', id: 'api', patch: { label: 'Kept' } },
    ]);

    expect(errors.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(errors[0]!.message).toMatch(/unknown node "ghost"/);
    expect(errors[2]!.message).toMatch(/duplicate id "api"/);
    expect(doc.edges.some((e) => e.id === 'e-x')).toBe(false);
    expect(doc.nodes.find((n) => n.id === 'api')!.label).toBe('Kept');
  });
});

describe('diffDocs', () => {
  it('finds nothing between equal docs', () => {
    expect(diffDocs(seraIot(), seraIot())).toEqual([]);
  });

  it('round-trips in both directions', () => {
    const a = seraIot();
    const b = removeElements(seraIot(), ['llm'], []);
    // The child comes first on purpose: the diff must add its parent before it.
    b.nodes.push(
      {
        id: 'cam',
        domain: 'hardware',
        type: 'sensor',
        label: 'Kamera',
        props: {},
        parent: 'edge-box',
      },
      { id: 'edge-box', domain: 'hardware', type: 'sbc', label: 'Kenar kutusu', props: {} },
    );
    b.views.find((v) => v.id === 'hardware')!.positions.cam = { x: 1, y: 2 };
    const api = b.nodes.find((n) => n.id === 'api')!;
    api.props = { ...api.props, port: 8080 };
    api.notes = 'Hono';
    const bme = b.edges.find((e) => e.id === 'e-bme')!;
    bme.pins = bme.pins!.slice(0, 1);
    b.edges.find((e) => e.id === 'e-store')!.protocol = 'TCP';
    b.flows.push({ id: 'telemetry', name: 'Telemetri', steps: ['e-publish', 'e-subscribe'] });
    b.boundaries.push({ id: 'device', name: 'Cihaz', trust: 'device', nodeIds: ['esp32'] });

    const forward = applyOps(a, diffDocs(a, b));
    expect(forward.errors).toEqual([]);
    expect(canon(forward.doc)).toEqual(canon(b));

    // Back again: restores the removed node with its edges and positions,
    // and drops the flow and boundary.
    const back = applyOps(b, diffDocs(b, a));
    expect(back.errors).toEqual([]);
    expect(canon(back.doc)).toEqual(canon(a));
  });

  it('swaps a parent and its child without passing through a cycle', () => {
    const a = seraIot();
    a.nodes.find((n) => n.id === 'bme280')!.parent = 'esp32';
    const b = seraIot();
    b.nodes.find((n) => n.id === 'esp32')!.parent = 'bme280';

    const { doc, errors } = applyOps(a, diffDocs(a, b));
    expect(errors).toEqual([]);
    expect(canon(doc)).toEqual(canon(b));
  });
});

describe('OpSchema', () => {
  it('accepts well-formed model output and rejects anything else', () => {
    expect(
      OpSchema.safeParse({ op: 'update_node', id: 'api', patch: { props: { port: null } } })
        .success,
    ).toBe(true);
    expect(OpSchema.safeParse({ op: 'drop_table', id: 'api' }).success).toBe(false);
    // Ids are validated like in the schema: no path characters.
    const node = { id: '../etc', domain: 'ai', type: 'agent', label: 'x' };
    expect(OpSchema.safeParse({ op: 'add_node', node }).success).toBe(false);
  });
});
