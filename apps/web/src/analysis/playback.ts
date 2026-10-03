import { flowTrace, type ArchDoc } from '@sysarch/shared';
import { create } from 'zustand';

/** How long one step of a flow plays; also the pulse's travel time. */
export const STEP_MS = 700;

interface Playback {
  flowId: string | null;
  step: number;
}

export const usePlayback = create<Playback>(() => ({ flowId: null, step: -1 }));
let timer: ReturnType<typeof setTimeout> | undefined;

/** Plays a flow one step at a time, then clears itself. */
export function playFlow(flowId: string, steps: number) {
  clearTimeout(timer);
  const advance = (step: number) => {
    if (step >= steps) return usePlayback.setState({ flowId: null, step: -1 });
    usePlayback.setState({ flowId, step });
    timer = setTimeout(() => advance(step + 1), STEP_MS);
  };
  advance(0);
}

export function stopFlow() {
  clearTimeout(timer);
  usePlayback.setState({ flowId: null, step: -1 });
}

/**
 * The link that pulses at a step, and whether the flow travels it against
 * its arrow. undefined when nothing plays or the flow breaks before it.
 */
export function pulseAt(
  doc: ArchDoc,
  flowId: string | null,
  step: number,
): { edgeId: string; reverse: boolean } | undefined {
  const flow = doc.flows.find((f) => f.id === flowId);
  const edgeId = flow?.steps[step];
  if (!flow || !edgeId) return undefined;
  const trace = flowTrace(doc, flow);
  if (trace.brokenAt !== undefined && step >= trace.brokenAt) return undefined;
  const edge = doc.edges.find((e) => e.id === edgeId)!;
  return { edgeId, reverse: edge.source !== trace.nodeIds[step] };
}
