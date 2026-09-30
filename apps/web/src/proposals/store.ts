import type { Proposal } from '@sysarch/server/api';
import type { OpError } from '@sysarch/shared';
import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { applyProposal, listProposals, rejectProposal } from '../api/client';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';
import { flushAutosave, useSaveStatus } from '../sync/autosave';
import { previewOps, type Preview } from './preview';

interface ProposalsState {
  /** Pending proposals of the open project, newest first. */
  list: Proposal[];
  /** The proposal under review; the canvas previews it while set. */
  openId: string | null;
  /** Indexes of the open proposal's ops the user keeps checked. */
  accepted: number[];
  /** Ops the server refused on the last apply, by proposal index. */
  conflicts: OpError[];
  busy: boolean;
  notice: { tone: 'ok' | 'error'; text: string } | null;
}

const initial: ProposalsState = {
  list: [],
  openId: null,
  accepted: [],
  conflicts: [],
  busy: false,
  notice: null,
};

export const useProposals = create<ProposalsState>(() => initial);
const set = useProposals.setState;
const get = useProposals.getState;

export async function loadProposals(projectId: string) {
  set({ ...initial });
  try {
    set({ list: await listProposals(projectId) });
  } catch {
    // Review is optional; the editor works without it. The next load retries.
  }
}

export function openProposal(id: string) {
  const p = get().list.find((x) => x.id === id);
  if (p) set({ openId: id, accepted: p.ops.map((_, i) => i), conflicts: [], notice: null });
}

export const closeProposal = () => set({ openId: null, accepted: [], conflicts: [] });

export function toggleOp(index: number, on: boolean) {
  const accepted = new Set(get().accepted);
  if (on) accepted.add(index);
  else accepted.delete(index);
  set({ accepted: [...accepted].sort((a, b) => a - b), conflicts: [] });
}

/**
 * Pending local edits are saved first, so the server applies the proposal on
 * top of exactly what the user sees. The result becomes one undo step.
 */
export async function applyOpen() {
  const { openId, accepted } = get();
  const project = useEditor.getState().project;
  if (!openId || !project || !accepted.length) return;
  set({ busy: true, notice: null });
  try {
    await flushAutosave();
    if (useSaveStatus.getState().state !== 'saved') {
      set({ notice: { tone: 'error', text: tr.proposals.saveFirst } });
      return;
    }
    const r = await applyProposal(project.id, openId, accepted);
    if (r.ok) {
      useEditor.getState().applyRemote(r.doc, r.revision);
      done(openId, tr.proposals.applied);
    } else if ('conflicts' in r) {
      set({ conflicts: r.conflicts, notice: { tone: 'error', text: tr.proposals.conflict } });
    } else {
      set({ notice: { tone: 'error', text: tr.proposals.failed } });
    }
  } catch {
    set({ notice: { tone: 'error', text: tr.proposals.failed } });
  } finally {
    set({ busy: false });
  }
}

export async function rejectOpen() {
  const { openId } = get();
  const project = useEditor.getState().project;
  if (!openId || !project) return;
  set({ busy: true, notice: null });
  try {
    if (await rejectProposal(project.id, openId)) done(openId, tr.proposals.rejected);
    else set({ notice: { tone: 'error', text: tr.proposals.failed } });
  } catch {
    set({ notice: { tone: 'error', text: tr.proposals.failed } });
  } finally {
    set({ busy: false });
  }
}

function done(id: string, text: string) {
  set((s) => ({
    list: s.list.filter((p) => p.id !== id),
    openId: null,
    accepted: [],
    conflicts: [],
    notice: { tone: 'ok', text },
  }));
}

export type OpenPreview = Preview & { proposal: Proposal };

/**
 * The open proposal's checked ops applied to the doc as it is now. Errors are
 * mapped back to proposal indexes, so an edit made meanwhile shows up as a
 * conflict before the user even presses apply.
 */
export function usePreview(): OpenPreview | null {
  const doc = useEditor((s) => s.doc);
  const { list, openId, accepted } = useProposals(
    useShallow((s) => ({ list: s.list, openId: s.openId, accepted: s.accepted })),
  );
  return useMemo(() => {
    const proposal = list.find((p) => p.id === openId);
    if (!proposal) return null;
    const preview = previewOps(
      doc,
      accepted.map((i) => proposal.ops[i]!),
    );
    const errors = preview.errors.map((e) => ({ ...e, index: accepted[e.index]! }));
    return { ...preview, errors, proposal };
  }, [doc, list, openId, accepted]);
}
