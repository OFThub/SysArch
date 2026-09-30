import { Panel } from '@xyflow/react';
import { Maximize, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { canvasApi } from './canvasApi';

/** Floating layer (8px radius, the one shadow) over the canvas corner. */
export function CanvasToolbar({ onLayout, busy }: { onLayout: () => void; busy: boolean }) {
  return (
    <Panel position="top-left">
      <div className="flex rounded-float border border-line bg-raised p-0.5 shadow-float">
        <ToolButton label={tr.canvas.autoLayout} onClick={onLayout} disabled={busy}>
          <Workflow size={16} strokeWidth={1.5} />
        </ToolButton>
        <ToolButton label={tr.canvas.fitView} onClick={() => canvasApi.fitView()}>
          <Maximize size={16} strokeWidth={1.5} />
        </ToolButton>
      </div>
    </Panel>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-7 items-center justify-center rounded-node text-ink-muted hover:bg-panel hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}
