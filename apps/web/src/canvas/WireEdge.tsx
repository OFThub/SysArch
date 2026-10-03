import { EdgeLabelRenderer, getSmoothStepPath, useStore, type EdgeProps } from '@xyflow/react';
import { useState } from 'react';
import { STEP_MS } from '../analysis/playback';
import { SeverityIcon } from '../ui/SeverityIcon';
import type { ArchFlowEdge } from './viewModel';

const LANE_GAP = 8;
const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const DIFF_COLOR = {
  added: 'var(--diff-add)',
  removed: 'var(--danger)',
  changed: 'var(--ink)',
} as const;

/**
 * Edge language: wired links are solid, wireless ones dashed, power a thick
 * double line. Orthogonal routing keeps parallel pin lines (SDA, SCL) bundled.
 * The protocol label appears only on hover or selection to keep the canvas quiet.
 */
export function WireEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ArchFlowEdge>) {
  const [hover, setHover] = useState(false);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 6,
    // Each line of a fan-out turns in its own lane instead of all at the midpoint.
    centerX: (sourceX + targetX) / 2 + (data?.lane ?? 0) * LANE_GAP,
  });
  if (!data) return null;

  // In a proposal preview the change outranks the channel: added lines in
  // the add color, removed ones faded red, changed ones in ink.
  const color = data.diff ? DIFF_COLOR[data.diff] : `var(--ch-${data.channel})`;
  const opacity = data.diff === 'removed' ? 0.45 : selected || hover || data.diff ? 1 : 0.7;
  const label = data.role ? `${data.edge.protocol} ${data.role}` : data.edge.protocol;

  return (
    <>
      <g onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {data.power ? (
          <>
            <path d={path} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={4} />
            <path d={path} fill="none" stroke="var(--canvas)" strokeWidth={1.5} />
          </>
        ) : (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeOpacity={opacity}
            strokeWidth={data.pulse ? 2.5 : selected ? 2 : 1.5}
            strokeDasharray={data.wireless ? '6 4' : undefined}
          />
        )}
        {/* A playing flow: a dot travels the link the way the flow goes. With
            reduced motion the thicker line alone marks the step. */}
        {data.pulse && !REDUCED_MOTION && (
          <Pulse path={path} color={color} back={data.pulse === 'back'} />
        )}
        {/* Wide invisible stroke so thin wires are easy to hover and click. */}
        <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
      </g>
      {/* The label shows on hover or selection; an issue badge stays visible. */}
      {(hover || selected || data.issue) && (
        <EdgeLabelRenderer>
          <div
            role={data.issue ? 'img' : undefined}
            aria-label={data.issue?.text}
            title={data.issue?.text}
            className="absolute flex items-center gap-1 rounded-chip border border-line bg-raised px-1 text-xs"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: data.issue ? 'all' : 'none',
            }}
          >
            {data.issue && <SeverityIcon severity={data.issue.severity} size={12} />}
            {(hover || selected) && label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/**
 * The dot of a playing flow. Sized against the zoom so it stays visible on a
 * zoomed-out overview; only the one pulsing link subscribes to the zoom.
 */
function Pulse({ path, color, back }: { path: string; color: string; back: boolean }) {
  const zoom = useStore((s) => s.transform[2]);
  return (
    <circle r={5 / Math.min(zoom, 1)} fill={color}>
      <animateMotion
        dur={`${STEP_MS}ms`}
        path={path}
        fill="freeze"
        calcMode="linear"
        keyPoints={back ? '1;0' : '0;1'}
        keyTimes="0;1"
      />
    </circle>
  );
}
