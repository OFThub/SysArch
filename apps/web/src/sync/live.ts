import type { ProjectEvent } from '@sysarch/server/api';
import { CLIENT_ID, loadProject, type ProjectData } from '../api/client';
import { refreshProposals } from '../proposals/store';
import { useEditor } from '../store';
import { useSaveStatus } from './autosave';

/**
 * Someone saved this project elsewhere (another tab, an applied proposal).
 * With nothing unsaved here, the new copy loads quietly in place; with local
 * edits, the user gets the same choice as on a save conflict. An outside
 * change never enters undo history.
 */
export async function onDocUpdated(
  event: Extract<ProjectEvent, { type: 'doc.updated' }>,
  load: (id: string) => Promise<ProjectData | null> = loadProject,
) {
  if (event.origin === CLIENT_ID) return;
  const { project } = useEditor.getState();
  if (!project || event.revision <= project.revision) return;

  if (useSaveStatus.getState().state !== 'saved') {
    useSaveStatus.setState({ state: 'conflict', serverRevision: event.revision }, true);
    return;
  }
  const fresh = await load(project.id);
  const now = useEditor.getState();
  // Things may have moved while loading: a local edit, a newer copy already in.
  const stale =
    !fresh ||
    now.project?.id !== fresh.id ||
    fresh.revision <= now.project.revision ||
    useSaveStatus.getState().state !== 'saved';
  if (stale) return;
  const view = now.activeViewId;
  now.loadProject(fresh);
  if (fresh.doc.views.some((v) => v.id === view)) useEditor.getState().setActiveView(view);
}

/** Listens to the project's server events while it is open; returns the stop function. */
export function watchProject(projectId: string) {
  const source = new EventSource(`/api/projects/${projectId}/events`);
  const parse = (m: MessageEvent<string>) => JSON.parse(m.data) as ProjectEvent;
  source.addEventListener('doc.updated', (m) => {
    const event = parse(m);
    if (event.type === 'doc.updated') void onDocUpdated(event);
  });
  source.addEventListener('proposal.changed', (m) => {
    if (parse(m).origin !== CLIENT_ID) void refreshProposals(projectId);
  });
  return () => source.close();
}
