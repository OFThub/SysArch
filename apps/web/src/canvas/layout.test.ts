import { seraIot } from '@sysarch/shared';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { layoutPositions, positionsFrom, toElkGraph } from './layout';
import { buildFlow } from './viewModel';

// The real layout engine, in-process: the browser runs the same one in a worker.
const elk = new ELK();
const doc = seraIot();
const noSizes = new Map<string, { width: number; height: number }>();

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('toElkGraph', () => {
  it('turns pads into side-pinned ports and edges into port-to-port links', () => {
    const graph = toElkGraph(buildFlow(doc, 'hardware'), noSizes);
    const esp = graph.children!.find((n) => n.id === 'esp32')!;
    const sda = esp.ports!.find((p) => p.id === 'esp32::out:GPIO8')!;
    expect(sda.layoutOptions!['elk.port.side']).toBe('EAST');
    expect(graph.edges!.find((e) => e.id === 'e-bme/SDA')).toMatchObject({
      sources: ['esp32::out:GPIO8'],
      targets: ['bme280::in:SDA'],
    });
  });

  it('wraps overview members in one compound node per domain', () => {
    const graph = toElkGraph(buildFlow(doc, 'overview'), noSizes);
    expect(graph.children!.map((c) => c.id).sort()).toEqual([
      'group:ai',
      'group:fullstack',
      'group:hardware',
    ]);
  });
});

describe('positionsFrom', () => {
  it('adds group offsets to nested children', () => {
    const pos = positionsFrom({
      id: 'root',
      children: [
        { id: 'group:ai', x: 100, y: 50, children: [{ id: 'n', x: 10, y: 5 }] },
        { id: 'm', x: 1, y: 2 },
      ],
    });
    expect(pos).toEqual({ n: { x: 110, y: 55 }, m: { x: 1, y: 2 } });
  });
});

describe('layoutPositions', () => {
  for (const viewId of ['hardware', 'overview']) {
    it(`places every node of the ${viewId} view without overlaps`, async () => {
      const model = buildFlow(doc, viewId);
      const pos = await layoutPositions(elk, model, noSizes);
      expect(Object.keys(pos).sort()).toEqual(model.nodes.map((n) => n.id).sort());
      const rects = Object.values(pos).map((p) => ({ ...p, w: 208, h: 80 }));
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
          expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
    });
  }

  it('flows left to right: a source sits left of its target', async () => {
    const pos = await layoutPositions(elk, buildFlow(doc, 'ai'), noSizes);
    expect(pos.history!.x).toBeLessThan(pos.train!.x);
    expect(pos.train!.x).toBeLessThan(pos.anomaly!.x);
  });
});
