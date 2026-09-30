import { ArchDocSchema, type ArchDoc } from '@sysarch/shared';
import { create } from 'zustand';
import { useEditor } from '../store';

export type SaveResult =
  { ok: true; revision: number } | { ok: false; conflict: number } | { ok: false; error: string };

export type SaveFn = (
  id: string,
  revision: number,
  doc: ArchDoc,
  opts: { keepalive: boolean },
) => Promise<SaveResult>;

export type SaveStatus =
  | { state: 'saved' }
  | { state: 'pending' }
  | { state: 'saving' }
  /** The doc fails validation (e.g. a label cleared mid-edit); it is not sent. */
  | { state: 'invalid'; issue: string }
  | { state: 'error'; message: string }
  /** Someone else saved first; the user chooses reload or overwrite. */
  | { state: 'conflict'; serverRevision: number };

export const useSaveStatus = create<SaveStatus>(() => ({ state: 'saved' }));

// The editor has one open project, so one autosave runs at a time.
let active: ReturnType<typeof startAutosave> | null = null;

/** Saves pending edits now, e.g. before the server changes the doc on its side. */
export const flushAutosave = () => active?.flush() ?? Promise.resolve();

/**
 * Debounced autosave of the editor doc. One save at a time, each carrying the
 * revision it was based on; changes made while a save is in flight go out in
 * the next one. Returns controls for tests and page-lifecycle hooks.
 */
export function startAutosave(save: SaveFn, delayMs = 800) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  let lastSaved: ArchDoc | null = useEditor.getState().doc;
  const set = (s: SaveStatus) => useSaveStatus.setState(s, true);

  const flush = async (keepalive = false): Promise<void> => {
    clearTimeout(timer);
    if (inflight) {
      await inflight;
      return flush(keepalive);
    }
    const { doc, project } = useEditor.getState();
    if (!project) return;
    // Back to what the server has (an edit undone, undo then redo): nothing
    // to send, but the pending state must still clear.
    if (doc === lastSaved) {
      if (useSaveStatus.getState().state === 'pending') set({ state: 'saved' });
      return;
    }
    if (useSaveStatus.getState().state === 'conflict') return;

    const valid = ArchDocSchema.safeParse(doc);
    if (!valid.success) {
      const i = valid.error.issues[0]!;
      return set({ state: 'invalid', issue: `${i.path.join('.')}: ${i.message}` });
    }

    set({ state: 'saving' });
    inflight = (async () => {
      let result: SaveResult;
      try {
        result = await save(project.id, project.revision, doc, { keepalive });
      } catch {
        result = { ok: false, error: 'network' };
      }
      if (result.ok) {
        lastSaved = doc;
        useEditor.getState().setRevision(result.revision);
        set({ state: useEditor.getState().doc === doc ? 'saved' : 'pending' });
      } else if ('conflict' in result) {
        set({ state: 'conflict', serverRevision: result.conflict });
      } else {
        set({ state: 'error', message: result.error });
      }
    })();
    await inflight;
    inflight = null;
    // Edits that landed during the save.
    if (useEditor.getState().doc !== lastSaved && useSaveStatus.getState().state === 'pending')
      schedule();
  };

  const schedule = () => {
    set({ state: 'pending' });
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  };

  const unsubscribe = useEditor.subscribe((s, prev) => {
    // loadProject swaps doc and project in one update; an edit changes only the
    // doc and setRevision only the project. A load (even of the same project,
    // e.g. after a conflict) is the server copy, so it is saved by definition.
    if (s.project !== prev.project && s.doc !== prev.doc) {
      clearTimeout(timer);
      lastSaved = s.doc;
      set({ state: 'saved' });
    } else if (s.doc !== prev.doc && s.project) {
      if (useSaveStatus.getState().state !== 'conflict') schedule();
    }
  });

  const controls = {
    flush,
    /** After a conflict: keep local edits and save them over the server copy. */
    overwrite: (serverRevision: number) => {
      useEditor.getState().setRevision(serverRevision);
      set({ state: 'pending' });
      return flush();
    },
    stop: () => {
      clearTimeout(timer);
      unsubscribe();
      if (active === controls) active = null;
    },
  };
  active = controls;
  return controls;
}
