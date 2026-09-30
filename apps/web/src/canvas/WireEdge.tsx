import { EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { useState } from 'react';
import { SeverityIcon } from '../ui/SeverityIcon';
import type { ArchFlowEdge } from './viewModel';

const LANE_GAP = 8;

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

  const color = `var(--ch-${data.channel})`;
  const opacity = selected || hover ? 1 : 0.7;
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
            strokeWidth={selected ? 2 : 1.5}
            strokeDasharray={data.wireless ? '6 4' : undefined}
          />
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
