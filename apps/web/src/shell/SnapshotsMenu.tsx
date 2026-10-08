import { History } from 'lucide-react';
import { useRef, useState, type ReactNode, type ToggleEvent } from 'react';
import {
  deleteSnapshot,
  forkSnapshot,
  listSnapshots,
  restoreSnapshot,
  takeSnapshot,
  type Snapshot,
} from '../api/client';
import { tr } from '../i18n/tr';
import { navigate } from '../nav';
import { openProposal, refreshProposals } from '../proposals/store';
import { useEditor } from '../store';
import { flushAutosave } from '../sync/autosave';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ago } from '../ui/time';
import { showSideTab } from './SidePanel';

/**
 * Named snapshots of the saved design, in a popover under the header. Taking
 * one saves first. Comparing files a proposal back to the snapshot and opens
 * it for review, so the canvas shows the difference; forking opens a copy
 * as a new project.
 */
export function SnapshotsMenu() {
  const projectId = useEditor((s) => s.project?.id);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Snapshot | null>(null);
  const t = tr.snapshots;

  const refresh = async () => {
    if (projectId) setList(await listSnapshots(projectId).catch(() => null));
  };

  const onToggle = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== 'open' || !button.current || !menu.current) return;
    const r = button.current.getBoundingClientRect();
    menu.current.style.top = `${r.bottom + 6}px`;
    menu.current.style.left = `${Math.max(8, r.right - menu.current.offsetWidth)}px`;
    setNotice(null);
    void refresh();
  };

  /** Runs an action; whatever it returns is shown as the outcome. */
  const run = async (action: (id: string) => Promise<string | void>) => {
    if (!projectId) return;
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await action(projectId);
      if (outcome) setNotice(outcome);
    } catch {
      setNotice(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const take = () =>
    run(async (id) => {
      await flushAutosave();
      const when = new Date().toLocaleString('tr', { dateStyle: 'short', timeStyle: 'short' });
      if (!(await takeSnapshot(id, name.trim() || t.defaultName(when)))) return t.failed;
      setName('');
      await refresh();
      return t.taken;
    });

  const compare = (s: Snapshot) =>
    run(async (id) => {
      await flushAutosave();
      const r = await restoreSnapshot(id, s.id, t.summary(s.name));
      if (!r.ok) return r.error === 'too_many_changes' ? t.tooMany : t.failed;
      if (r.id === null) return t.same;
      menu.current?.hidePopover();
      showSideTab('proposals');
      await refreshProposals(id);
      openProposal(r.id);
    });

  const fork = (s: Snapshot) =>
    run(async (id) => {
      const project = useEditor.getState().doc.meta.name;
      const copy = await forkSnapshot(id, s.id, t.forkName(project, s.name).slice(0, 120));
      if (!copy) return t.failed;
      navigate(`/p/${copy}`);
    });

  const remove = (s: Snapshot) => {
    setToDelete(null);
    void run(async (id) => {
      if (!(await deleteSnapshot(id, s.id))) return t.failed;
      await refresh();
    });
  };

  return (
    <>
      <button
        ref={button}
        popoverTarget="snapshots-menu"
        aria-label={t.open}
        title={t.open}
        className="flex size-7 items-center justify-center text-ink-muted hover:text-ink"
      >
        <History size={16} strokeWidth={1.5} aria-hidden />
      </button>
      <div
        ref={menu}
        id="snapshots-menu"
        popover="auto"
        onToggle={onToggle}
        aria-label={t.open}
        className="fixed m-0 w-80 rounded-float border border-line bg-raised p-3 text-ink shadow-float"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void take();
          }}
          className="flex gap-2"
        >
          <input
            aria-label={t.name}
            placeholder={t.placeholder}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-chip border border-line bg-raised px-2 text-sm placeholder:text-ink-muted"
          />
          <button
            disabled={busy}
            className="h-7 shrink-0 rounded-chip bg-ink px-2.5 text-sm font-medium text-raised disabled:opacity-50"
          >
            {t.take}
          </button>
        </form>
        {notice && (
          <p role="status" className="mt-2 text-sm text-ink-muted">
            {notice}
          </p>
        )}
        {list?.length === 0 && <p className="mt-3 text-sm text-ink-muted">{t.empty}</p>}
        {list && list.length > 0 && (
          <ul className="mt-3">
            {list.map((s) => (
              <li key={s.id} className="border-t border-line py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{ago(s.createdAt)}</span>
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <MenuButton disabled={busy} onClick={() => void compare(s)}>
                    {t.compare}
                  </MenuButton>
                  <MenuButton disabled={busy} onClick={() => void fork(s)}>
                    {t.fork}
                  </MenuButton>
                  <MenuButton
                    disabled={busy}
                    onClick={() => {
                      menu.current?.hidePopover();
                      setToDelete(s);
                    }}
                  >
                    {t.remove}
                  </MenuButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {toDelete && (
        <ConfirmDialog
          title={t.removeTitle}
          body={t.removeBody(toDelete.name)}
          confirmLabel={t.remove}
          cancelLabel={t.cancel}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove(toDelete)}
        />
      )}
    </>
  );
}

function MenuButton(props: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      {...props}
      className="h-7 rounded-chip border border-line px-2 text-xs hover:bg-panel disabled:opacity-50"
    />
  );
}
