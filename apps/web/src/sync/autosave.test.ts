import { seraIot } from '@sysarch/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditor } from '../store';
import { startAutosave, useSaveStatus, type SaveFn } from './autosave';

const s = () => useEditor.getState();
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  useSaveStatus.setState({ state: 'saved' }, true);
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

function start(save: SaveFn) {
  const auto = startAutosave(save, 800);
  stop = auto.stop;
  s().loadProject({ id: `p${Math.random()}`, revision: 1, doc: seraIot() });
  return auto;
}

describe('autosave', () => {
  it('saves once, after the edits stop, with the base revision', async () => {
    const save = vi.fn<SaveFn>(async () => ({ ok: true, revision: 2 }));
    start(save);

    s().updateNode('api', { label: 'A' });
    s().updateNode('api', { label: 'AB' });
    expect(useSaveStatus.getState().state).toBe('pending');
    await vi.advanceTimersByTimeAsync(800);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toBe(1);
    expect(s().project?.revision).toBe(2);
    expect(useSaveStatus.getState().state).toBe('saved');
  });

  it('does not save right after a project loads', async () => {
    const save = vi.fn<SaveFn>();
    start(save);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it('holds back an invalid doc instead of sending it', async () => {
    const save = vi.fn<SaveFn>();
    start(save);
    s().updateNode('api', { label: '' });
    await vi.advanceTimersByTimeAsync(800);
    expect(save).not.toHaveBeenCalled();
    expect(useSaveStatus.getState()).toMatchObject({ state: 'invalid' });
  });

  it('stops on a conflict and saves over the server copy only when asked', async () => {
    const save = vi
      .fn<SaveFn>()
      .mockResolvedValueOnce({ ok: false, conflict: 5 })
      .mockResolvedValueOnce({ ok: true, revision: 6 });
    const auto = start(save);

    s().updateNode('api', { label: 'Mine' });
    await vi.advanceTimersByTimeAsync(800);
    expect(useSaveStatus.getState()).toEqual({ state: 'conflict', serverRevision: 5 });

    // Further edits do not save while the conflict is unresolved.
    s().updateNode('api', { label: 'Mine too' });
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);

    await auto.overwrite(5);
    expect(save.mock.calls[1]![1]).toBe(5);
    expect(s().project?.revision).toBe(6);
    expect(useSaveStatus.getState().state).toBe('saved');
  });

  it('sends edits made during a save in a follow-up save', async () => {
    let finish!: (r: { ok: true; revision: number }) => void;
    const save = vi
      .fn<SaveFn>()
      .mockImplementationOnce(() => new Promise((r) => (finish = r)))
      .mockResolvedValueOnce({ ok: true, revision: 3 });
    start(save);

    s().updateNode('api', { label: 'First' });
    await vi.advanceTimersByTimeAsync(800);
    s().addNode(
      { id: 'n1', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} },
      'fullstack',
      { x: 0, y: 0 },
    );
    finish({ ok: true, revision: 2 });
    await vi.advanceTimersByTimeAsync(800);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![1]).toBe(2);
    expect(save.mock.calls[1]![2].nodes.some((n) => n.id === 'n1')).toBe(true);
  });

  it('clears a conflict when the server copy is reloaded', async () => {
    const save = vi.fn<SaveFn>().mockResolvedValueOnce({ ok: false, conflict: 4 });
    start(save);
    const id = s().project!.id;
    s().updateNode('api', { label: 'Mine' });
    await vi.advanceTimersByTimeAsync(800);
    expect(useSaveStatus.getState().state).toBe('conflict');

    s().loadProject({ id, revision: 4, doc: seraIot() });
    expect(useSaveStatus.getState().state).toBe('saved');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure', async () => {
    start(vi.fn<SaveFn>().mockRejectedValue(new Error('offline')));
    s().updateNode('api', { label: 'x' });
    await vi.advanceTimersByTimeAsync(800);
    expect(useSaveStatus.getState()).toEqual({ state: 'error', message: 'network' });
  });
});
