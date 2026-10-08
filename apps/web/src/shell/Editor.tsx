import { ChevronLeft, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { Canvas } from '../canvas/Canvas';
import { tr } from '../i18n/tr';
import { Palette } from '../panels/Palette';
import { Breadcrumb } from './Breadcrumb';
import { ExportMenu } from './ExportMenu';
import { ImportButton } from './ImportDialog';
import { SnapshotsMenu } from './SnapshotsMenu';
import { SidePanel } from './SidePanel';
import { ThemeSwitch } from './ThemeSwitch';
import { useShortcuts } from './useShortcuts';
import { ViewTabs } from './ViewTabs';
import { redo, undo, useEditor, useHistory } from '../store';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { navigate } from '../nav';

type PendingDelete = { nodeIds: string[]; edgeIds: string[]; edgeCount: number };

/** The editing surface for the loaded project. Save state is supplied by the caller. */
export function Editor({ saveStatus, banner }: { saveStatus: ReactNode; banner?: ReactNode }) {
  const name = useEditor((s) => s.doc.meta.name);
  const { canUndo, canRedo } = useHistory();
  const [pending, setPending] = useState<PendingDelete | null>(null);

  // One element goes at once (undo is a keystroke away); anything that takes
  // more with it, like a node's edges, asks first.
  const requestDelete = useCallback((nodeIds: string[], edgeIds: string[]) => {
    const { doc, deleteElements } = useEditor.getState();
    const nodes = new Set(nodeIds);
    const edges = new Set(edgeIds);
    for (const e of doc.edges) if (nodes.has(e.source) || nodes.has(e.target)) edges.add(e.id);
    if (nodes.size + edges.size <= 1) deleteElements(nodeIds, edgeIds);
    else setPending({ nodeIds, edgeIds, edgeCount: edges.size });
  }, []);
  useShortcuts(requestDelete);

  // The open view can disappear (an undo before its drill view existed, its
  // root deleted, a newer copy loaded); fall back to the overview.
  const viewMissing = useEditor((s) => !s.doc.views.some((v) => v.id === s.activeViewId));
  useEffect(() => {
    if (viewMissing) useEditor.getState().setActiveView('overview');
  }, [viewMissing]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-stretch gap-6 border-b border-line bg-panel px-4">
        <div className="flex items-center gap-2">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
            className="flex items-center gap-0.5 text-sm text-ink-muted hover:text-ink"
          >
            <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
            {tr.projects.back}
          </a>
          <span aria-hidden className="text-line">
            /
          </span>
          <h1 className="font-wide text-md font-semibold">{name}</h1>
        </div>
        <ViewTabs />
        <div className="ml-auto flex items-center gap-3">
          {saveStatus}
          <SnapshotsMenu />
          <ImportButton />
          <ExportMenu />
          <div className="flex">
            <IconButton label={tr.edit.undo} shortcut="Ctrl+Z" disabled={!canUndo} onClick={undo}>
              <Undo2 size={16} strokeWidth={1.5} />
            </IconButton>
            <IconButton
              label={tr.edit.redo}
              shortcut="Ctrl+Shift+Z"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo2 size={16} strokeWidth={1.5} />
            </IconButton>
          </div>
          <ThemeSwitch />
        </div>
      </header>
      {banner}
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="flex min-w-0 flex-1 flex-col">
          <Breadcrumb />
          <div className="min-h-0 flex-1">
            <Canvas />
          </div>
          <AnalysisPanel />
        </main>
        <SidePanel />
      </div>
      {pending && (
        <ConfirmDialog
          title={tr.edit.deleteTitle}
          body={tr.edit.deleteBody(pending.nodeIds.length, pending.edgeCount)}
          confirmLabel={tr.edit.delete}
          cancelLabel={tr.edit.cancel}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            useEditor.getState().deleteElements(pending.nodeIds, pending.edgeIds);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

function IconButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={`${label} (${shortcut})`}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-40 disabled:hover:text-ink-muted"
    >
      {children}
    </button>
  );
}
