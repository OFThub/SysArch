import { useNodes, useReactFlow, ViewportPortal } from '@xyflow/react';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';

/** Space between a zone's frame and the components inside it. */
const PAD = 20;

/**
 * Trust boundaries drawn as dashed frames around their members in the open
 * view: an overlay, not a group, so a component can sit in a domain group
 * and a trust zone at once. Frames ignore the pointer; the canvas stays
 * fully editable underneath.
 */
export function BoundaryOverlay() {
  const boundaries = useEditor((s) => s.doc.boundaries);
  useNodes(); // re-render as components move or get measured
  const { getInternalNode } = useReactFlow();
  if (!boundaries.length) return null;

  return (
    <ViewportPortal>
      {boundaries.map((b) => {
        const boxes = b.nodeIds.flatMap((id) => {
          const n = getInternalNode(id);
          if (!n) return [];
          const { x, y } = n.internals.positionAbsolute;
          return [{ x, y, r: x + (n.measured.width ?? 0), b: y + (n.measured.height ?? 0) }];
        });
        if (!boxes.length) return null;
        const left = Math.min(...boxes.map((p) => p.x)) - PAD;
        const top = Math.min(...boxes.map((p) => p.y)) - PAD;
        const width = Math.max(...boxes.map((p) => p.r)) + PAD - left;
        const height = Math.max(...boxes.map((p) => p.b)) + PAD - top;
        return (
          <div
            key={b.id}
            data-boundary={b.id}
            className="pointer-events-none absolute left-0 top-0 rounded-node border border-dashed border-ink-muted"
            style={{ transform: `translate(${left}px, ${top}px)`, width, height }}
          >
            <span className="absolute -top-5 left-0 whitespace-nowrap text-xs text-ink-muted">
              {b.name === tr.threats.trust[b.trust]
                ? b.name
                : `${b.name} (${tr.threats.trust[b.trust]})`}
            </span>
          </div>
        );
      })}
    </ViewportPortal>
  );
}
