import type { NodeProps } from '@xyflow/react';
import { tr } from '../i18n/tr';
import type { FrameFlowNode } from './viewModel';

/** Overview grouping: a quiet outline with the domain named in its channel. */
export function FrameNode({ data }: NodeProps<FrameFlowNode>) {
  return (
    <div className="pointer-events-none h-full w-full rounded-float border border-line">
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink-muted">
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: `var(--ch-${data.domain})` }}
        />
        {tr.domain[data.domain]}
      </div>
    </div>
  );
}
