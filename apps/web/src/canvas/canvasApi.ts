import type { ReactFlowInstance } from '@xyflow/react';

// The live React Flow instance, for code outside the canvas (palette, command
// palette) that needs flow coordinates. A module ref, not store state: it is
// not data and must never enter undo history.
type Flow = Pick<ReactFlowInstance, 'screenToFlowPosition'>;
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

  /** Centre of the visible canvas, stepped diagonally so repeated adds don't stack. */
  nextFreeCenter() {
    if (!flow || !element) return { x: 0, y: 0 };
    const r = element.getBoundingClientRect();
    const step = (added++ % 6) * 24;
    const p = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: p.x + step, y: p.y + step };
  },
};
