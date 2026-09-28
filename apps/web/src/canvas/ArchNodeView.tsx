import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useCatalog } from '../store';
import type { ArchFlowNode } from './viewModel';

export function ArchNodeView({ data, selected }: NodeProps<ArchFlowNode>) {
  const { node, proxy } = data;
  const type = useCatalog().get(node.type);
  const channel = `var(--ch-${node.domain})`;

  return (
    <div
      className="min-w-48 rounded-node border border-line bg-raised"
      style={{
        borderLeft: `3px solid ${channel}`,
        opacity: proxy ? 0.45 : 1,
        outline: selected ? `2px solid ${channel}` : undefined,
        outlineOffset: 1,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="px-3 py-2">
        <div className="text-base font-semibold">{node.label}</div>
        <div className="text-xs text-ink-muted">{type?.label ?? node.type}</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
