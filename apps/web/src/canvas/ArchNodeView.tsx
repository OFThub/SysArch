import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useEffect } from 'react';
import { tr } from '../i18n/tr';
import { NodeIcon } from '../icons/NodeIcon';
import { useCatalog } from '../store';
import { SeverityIcon } from '../ui/SeverityIcon';
import type { ArchFlowNode, Pad } from './viewModel';

/**
 * A node drawn as a terminal block: channel stripe on the left, type glyph and
 * label on top, and a labelled square pad for every pin or protocol in use.
 * Inputs sit on the left edge, outputs on the right, like a schematic symbol.
 */
export function ArchNodeView({ id, data, selected }: NodeProps<ArchFlowNode>) {
  const { node, proxy, pads } = data;
  const type = useCatalog().get(node.type);
  const channel = `var(--ch-${node.domain})`;
  const hasPads = pads.in.length > 0 || pads.out.length > 0;

  // React Flow re-measures handles only when the node resizes. A pad added
  // beside a longer column keeps the size, so tell it explicitly; otherwise
  // the new edge would have no handle to attach to.
  const updateNodeInternals = useUpdateNodeInternals();
  const padKey = [...pads.in, ...pads.out].map((p) => p.id).join('|');
  useEffect(() => updateNodeInternals(id), [id, padKey, updateNodeInternals]);

  const diff = data.diff && DIFF[data.diff];

  return (
    <div
      className={`min-w-52 rounded-node border border-line bg-raised ${data.diff === 'added' ? 'diff-enter' : ''}`}
      style={{
        borderLeft: `3px solid ${channel}`,
        opacity: data.diff === 'removed' ? 0.45 : proxy ? 0.5 : 1,
        outline: diff ? diff.outline : selected ? `2px solid ${channel}` : undefined,
        outlineOffset: diff ? 3 : 1,
      }}
    >
      <div className="relative flex items-start gap-2 px-3 py-2">
        {/* Drag between these (or any pad) to connect; revealed on hover. */}
        <Handle id="in:new" type="target" position={Position.Left} className="connect" />
        <Handle id="out:new" type="source" position={Position.Right} className="connect" />
        <span className="mt-0.5 text-ink-muted">
          <NodeIcon name={type?.icon ?? 'box'} />
        </span>
        <div className="min-w-0">
          <div
            className={`truncate text-base font-semibold ${data.diff === 'removed' ? 'line-through' : ''}`}
          >
            {node.label}
          </div>
          <div className="text-xs text-ink-muted">{type?.label ?? node.type}</div>
        </div>
        {diff && data.diff && (
          <span
            className="ml-auto shrink-0 rounded-chip border px-1 text-xs"
            style={{ color: diff.color, borderColor: diff.color }}
          >
            {tr.proposals.mark[data.diff]}
          </span>
        )}
        {data.issue && (
          <span
            role="img"
            aria-label={data.issue.text}
            title={data.issue.text}
            className={`${diff ? '' : 'ml-auto'} flex items-center gap-0.5 pt-0.5 text-xs tabular-nums`}
          >
            <SeverityIcon severity={data.issue.severity} />
            {data.issue.count > 1 && data.issue.count}
          </span>
        )}
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

/**
 * Proposal marks. Shape and a text tag carry the meaning, color only
 * reinforces it: dashed for what comes or goes, solid for what changes.
 */
const DIFF = {
  added: { outline: '1.5px dashed var(--diff-add)', color: 'var(--diff-add)' },
  removed: { outline: '1.5px dashed var(--danger)', color: 'var(--danger)' },
  changed: { outline: '1.5px solid var(--ink-muted)', color: 'var(--ink-muted)' },
} as const;

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
