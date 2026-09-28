import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NodeIcon } from '../icons/NodeIcon';
import { useCatalog } from '../store';
import type { ArchFlowNode, Pad } from './viewModel';

/**
 * A node drawn as a terminal block: channel stripe on the left, type glyph and
 * label on top, and a labelled square pad for every pin or protocol in use.
 * Inputs sit on the left edge, outputs on the right, like a schematic symbol.
 */
export function ArchNodeView({ data, selected }: NodeProps<ArchFlowNode>) {
  const { node, proxy, pads } = data;
  const type = useCatalog().get(node.type);
  const channel = `var(--ch-${node.domain})`;
  const hasPads = pads.in.length > 0 || pads.out.length > 0;

  return (
    <div
      className="min-w-52 rounded-node border border-line bg-raised"
      style={{
        borderLeft: `3px solid ${channel}`,
        opacity: proxy ? 0.5 : 1,
        outline: selected ? `2px solid ${channel}` : undefined,
        outlineOffset: 1,
      }}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <span className="mt-0.5 text-ink-muted">
          <NodeIcon name={type?.icon ?? 'box'} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{node.label}</div>
          <div className="text-xs text-ink-muted">{type?.label ?? node.type}</div>
        </div>
      </div>
      {hasPads && (
        <div className="flex justify-between gap-6 border-t border-line py-1.5">
          <PadColumn pads={pads.in} side="in" channel={channel} />
          <PadColumn pads={pads.out} side="out" channel={channel} />
        </div>
      )}
    </div>
  );
}

function PadColumn({ pads, side, channel }: { pads: Pad[]; side: 'in' | 'out'; channel: string }) {
  const isIn = side === 'in';
  return (
    <div className={isIn ? 'flex flex-col' : 'flex flex-col items-end'}>
      {pads.map((pad) => (
        <div key={pad.id} className={`relative flex h-5 items-center ${isIn ? 'pl-3' : 'pr-3'}`}>
          <Handle
            id={pad.id}
            type={isIn ? 'target' : 'source'}
            position={isIn ? Position.Left : Position.Right}
            className="pad"
            style={{ background: channel }}
          />
          <span className="font-mono text-xs text-ink-muted">{pad.label}</span>
        </div>
      ))}
    </div>
  );
}
