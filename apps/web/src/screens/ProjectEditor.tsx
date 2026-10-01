import { useEffect, useRef, useState } from 'react';
import { loadProject, saveProject } from '../api/client';
import { tr } from '../i18n/tr';
import { navigate } from '../nav';
import { loadProposals } from '../proposals/store';
import { Editor } from '../shell/Editor';
import { ConflictBanner, SaveStatus } from '../shell/SaveStatus';
import { useEditor } from '../store';
import { startAutosave, useSaveStatus } from '../sync/autosave';
import { watchProject } from '../sync/live';

type Phase = 'loading' | 'ready' | 'missing' | 'failed';

/** Loads a project into the editor and keeps it saved while it is open. */
export function ProjectEditor({ id }: { id: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  // Bumped to fetch again (retry, or reload after a conflict).
  const [attempt, setAttempt] = useState(0);
  const autosave = useRef<ReturnType<typeof startAutosave> | null>(null);

  useEffect(() => {
    let current = true;
    loadProject(id).then(
      (project) => {
        if (!current) return;
        if (!project) return setPhase('missing');
        useEditor.getState().loadProject(project);
        void loadProposals(project.id);
        setPhase('ready');
      },
      () => current && setPhase('failed'),
    );
    return () => {
      current = false;
    };
  }, [id, attempt]);

  // Live updates (other tabs, new proposals) while the project is open.
  useEffect(() => (phase === 'ready' ? watchProject(id) : undefined), [phase, id]);

  const reload = () => {
    setPhase('loading');
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    const auto = startAutosave(saveProject);
    autosave.current = auto;
    // Best effort on tab close; the browser caps keepalive bodies, so autosave
    // after each pause remains the real guarantee.
    const onHide = () => void auto.flush(true);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useSaveStatus.getState().state !== 'saved') e.preventDefault();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void auto.flush().finally(() => auto.stop());
    };
  }, []);

  if (phase === 'loading') return <div className="h-full bg-canvas" />;
  if (phase !== 'ready') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-canvas p-6">
        <p>{phase === 'missing' ? tr.projects.notFound : tr.projects.openFailed}</p>
        <div className="flex gap-2">
          {phase === 'failed' && (
            <button onClick={reload} className="h-8 rounded-chip border border-line px-3 text-sm">
              {tr.projects.retry}
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            className="h-8 rounded-chip border border-line px-3 text-sm"
          >
            {tr.projects.back}
          </button>
        </div>
      </main>
    );
  }

  return (
    <Editor
      saveStatus={<SaveStatus onRetry={() => void autosave.current?.flush()} />}
      banner={
        <ConflictBanner
          onReload={reload}
          onOverwrite={(revision) => void autosave.current?.overwrite(revision)}
        />
      }
    />
  );
}
