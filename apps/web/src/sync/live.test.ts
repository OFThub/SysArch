import { seraIot } from '@sysarch/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, type ProjectData } from '../api/client';
import { useEditor } from '../store';
import { useSaveStatus } from './autosave';
import { onDocUpdated } from './live';

const s = () => useEditor.getState();
const remote = (revision: number): ProjectData => {
  const doc = seraIot();
  doc.meta.name = `Sürüm ${revision}`;
  return { id: 'p1', revision, doc };
};

beforeEach(() => {
  s().loadProject({ id: 'p1', revision: 2, doc: seraIot() });
  useSaveStatus.setState({ state: 'saved' }, true);
});

describe('onDocUpdated', () => {
  it("ignores the tab's own saves and revisions it already has", async () => {
    const load = vi.fn(async () => remote(3));
    await onDocUpdated({ type: 'doc.updated', revision: 3, origin: CLIENT_ID }, load);
    await onDocUpdated({ type: 'doc.updated', revision: 2 }, load);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads a newer copy in place when nothing is unsaved, keeping the open tab', async () => {
    s().setActiveView('hardware');
    s().updateNode('api', { label: 'Yerel' });
    useSaveStatus.setState({ state: 'saved' }, true);

    await onDocUpdated({ type: 'doc.updated', revision: 3 }, async () => remote(3));

    expect(s().project?.revision).toBe(3);
    expect(s().doc.meta.name).toBe('Sürüm 3');
    expect(s().activeViewId).toBe('hardware');
    // An outside change is not something to undo.
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0);
  });

  it('offers the conflict choice instead of loading over unsaved edits', async () => {
    useSaveStatus.setState({ state: 'pending' }, true);
    const load = vi.fn(async () => remote(3));

    await onDocUpdated({ type: 'doc.updated', revision: 3 }, load);

    expect(load).not.toHaveBeenCalled();
    expect(useSaveStatus.getState()).toEqual({ state: 'conflict', serverRevision: 3 });
  });
});
