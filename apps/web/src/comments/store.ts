import { create } from 'zustand';
import {
  addComment,
  listComments,
  removeComment,
  resolveThread,
  type CommentError,
  type CommentSource,
  type NewComment,
} from '../api/client';
import { tr } from '../i18n/tr';
import { openByNode, type Comment } from './threads';

interface CommentsState {
  /** Where the open design's comments live; null when it has none to show. */
  source: CommentSource | null;
  list: Comment[];
  /** Open threads per component, for the canvas marks. */
  openByNode: Record<string, number>;
  status: 'loading' | 'ready' | 'error';
  busy: boolean;
  notice: { tone: 'ok' | 'error'; text: string } | null;
}

const initial: CommentsState = {
  source: null,
  list: [],
  openByNode: {},
  status: 'loading',
  busy: false,
  notice: null,
};

export const useComments = create<CommentsState>(() => initial);
const set = useComments.setState;
const get = useComments.getState;

export async function loadComments(source: CommentSource | null) {
  set({ ...initial, source });
  if (source) await refreshComments();
}

/** Reloads the list; also how live updates arrive. */
export async function refreshComments() {
  const { source } = get();
  if (!source) return;
  try {
    const list = await listComments(source);
    // Another design may have opened while this loaded.
    if (get().source === source) set({ list, openByNode: openByNode(list), status: 'ready' });
  } catch {
    if (get().source === source) set({ status: 'error' });
  }
}

/** One write, then a fresh list; false when it failed (the notice says why). */
async function write(
  action: (source: CommentSource) => Promise<CommentError | boolean | null>,
  done?: string,
) {
  const { source } = get();
  if (!source) return false;
  set({ busy: true, notice: null });
  try {
    const r = await action(source);
    if (r === false || typeof r === 'string') {
      const text = r === 'rate_limited' ? tr.comments.rateLimited : tr.comments.failed;
      set({ notice: { tone: 'error', text } });
      return false;
    }
    await refreshComments();
    if (done) set({ notice: { tone: 'ok', text: done } });
    return true;
  } catch {
    set({ notice: { tone: 'error', text: tr.comments.failed } });
    return false;
  } finally {
    set({ busy: false });
  }
}

export const postComment = (input: NewComment) =>
  write(
    (source) => addComment(source, input),
    'parentId' in input ? tr.comments.replied : tr.comments.added,
  );

export const deleteComment = (id: string) => write((source) => removeComment(source, id));

/** Owner only; the link side has no resolve. */
export const setResolved = (id: string, resolved: boolean) =>
  write(async (source) => 'project' in source && resolveThread(source.project, id, resolved));
