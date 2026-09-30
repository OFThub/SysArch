import type { Node, ReactFlowInstance, Rect } from '@xyflow/react';

// The live React Flow instance, for code outside the canvas (palette, command
// palette) that needs flow coordinates. A module ref, not store state: it is
// not data and must never enter undo history.
// Only what we call, typed structurally so any node-typed instance fits.
type Flow = {
  screenToFlowPosition: ReactFlowInstance['screenToFlowPosition'];
  getNodes: () => Node[];
  getNodesBounds: (nodeIds: string[]) => Rect;
  fitView: (options?: {
    padding?: number;
    duration?: number;
    nodes?: { id: string }[];
  }) => Promise<boolean>;
};
let flow: Flow | null = null;
let element: HTMLElement | null = null;
let added = 0;

export const DND_MIME = 'application/x-sysarch-palette';

export const canvasApi = {
  attach(instance: Flow, el: HTMLElement | null) {
    flow = instance;
    element = el;
  },

  toFlow(clientX: number, clientY: number) {
    return flow?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: 0, y: 0 };
  },

  fitView() {
    void flow?.fitView({ padding: 0.1, duration: 120 });
  },

  /** Bounds of every drawn node, frames included (for image export); undefined when empty. */
  bounds() {
    const nodes = flow?.getNodes() ?? [];
    return flow && nodes.length ? flow.getNodesBounds(nodes.map((n) => n.id)) : undefined;
  },

  /** Every node currently drawn, frames included, with measured sizes. */
  nodes(): Node[] {
    return flow?.getNodes() ?? [];
  },

  /** Zooms to the given nodes (an issue's components). */
  fitNodes(ids: string[]) {
    if (!ids.length) return;
    void flow?.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.5, duration: 200 });
  },

  /** Centre of the visible canvas, stepped diagonally so repeated adds don't stack. */
  nextFreeCenter() {
    if (!flow || !element) return { x: 0, y: 0 };
    const r = element.getBoundingClientRect();
    const step = (added++ % 6) * 24;
    const p = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: p.x + step, y: p.y + step };
  },
};
