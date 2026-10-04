import { ImportError, importOps, readSource } from '@sysarch/shared';
import { Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createProposal } from '../api/client';
import { tr } from '../i18n/tr';
import { openProposal, refreshProposals } from '../proposals/store';
import { useCatalog, useEditor } from '../store';
import { flushAutosave } from '../sync/autosave';
import { SeverityIcon } from '../ui/SeverityIcon';
import { showSideTab } from './SidePanel';

/** Big enough for any compose file or diagram; keeps a stray upload from freezing the tab. */
const MAX_BYTES = 1_000_000;
const SHOWN_NOTES = 5;

export function ImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-7 items-center gap-1.5 rounded-chip border border-line px-2.5 text-sm hover:bg-raised"
      >
        <Upload size={14} strokeWidth={1.5} aria-hidden />
        {tr.import.open}
      </button>
      {open && <ImportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Brings a docker-compose file, Mermaid flowchart or Wokwi diagram in as a
 * proposal: the format is read from the content, what it found is shown
 * before anything is sent, and the result opens in the proposals tab for
 * review. The design itself only changes when the proposal is applied.
 */
function ImportDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const catalog = useCatalog();
  const [text, setText] = useState('');
  const [tooBig, setTooBig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const read = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return { ok: true as const, ...readSource(text, catalog) };
    } catch (e) {
      return { ok: false as const, code: e instanceof ImportError ? e.code : 'syntax' };
    }
  }, [text, catalog]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setTooBig(file.size > MAX_BYTES);
    if (file.size <= MAX_BYTES) setText(await file.text());
  };

  const submit = async () => {
    const project = useEditor.getState().project;
    if (!read?.ok || !project) return;
    setBusy(true);
    setFailed(false);
    // The server reviews against the saved doc; save first so both agree.
    await flushAutosave();
    const format = tr.import.format[read.format];
    // The notes go along, so whoever reviews later sees what was guessed or left out.
    const notes = read.notes.map((n) => `${tr.import[n.code](n.subject)}.`);
    const summary = [tr.import.summary(format, read.nodes.length, read.edges.length), ...notes];
    const sent = await createProposal(project.id, {
      summary: summary.join(' ').slice(0, 2000),
      ops: importOps(useEditor.getState().doc, read),
      source: 'import',
    }).catch(() => ({ ok: false as const }));
    setBusy(false);
    if (!sent.ok) return setFailed(true);
    showSideTab('proposals');
    await refreshProposals(project.id);
    openProposal(sent.id);
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="import-title"
      className="m-auto w-[36rem] rounded-float border border-line bg-raised p-5 text-ink shadow-float backdrop:bg-black/30"
    >
      <h2 id="import-title" className="text-md font-semibold">
        {tr.import.open}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">{tr.import.body}</p>
      <div className="mt-4 flex items-center gap-3">
        <label className="flex h-8 cursor-pointer items-center rounded-chip border border-line px-3 text-sm hover:bg-panel has-[:focus-visible]:outline-2">
          {tr.import.file}
          <input
            type="file"
            accept=".yml,.yaml,.json,.md,.mmd,.mermaid,.txt"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        {tooBig && (
          <p role="alert" className="flex items-center gap-2 text-sm">
            <SeverityIcon severity="warning" />
            {tr.import.tooBig}
          </p>
        )}
      </div>
      <textarea
        aria-label={tr.import.text}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={tr.import.placeholder}
        rows={10}
        spellCheck={false}
        className="mt-3 w-full resize-y rounded-chip border border-line bg-raised p-2 font-mono text-xs placeholder:font-sans placeholder:text-sm placeholder:text-ink-muted"
      />
      <div role="status" className="mt-2 min-h-5 text-sm">
        {read?.ok ? (
          <>
            <p>
              {tr.import.found(tr.import.format[read.format], read.nodes.length, read.edges.length)}
            </p>
            {read.notes.length > 0 && (
              <ul className="mt-1 grid gap-0.5 text-ink-muted">
                {read.notes.slice(0, SHOWN_NOTES).map((n, i) => (
                  <li key={i}>{tr.import[n.code](n.subject)}</li>
                ))}
                {read.notes.length > SHOWN_NOTES && (
                  <li>{tr.import.more(read.notes.length - SHOWN_NOTES)}</li>
                )}
              </ul>
            )}
          </>
        ) : read ? (
          <p className="flex items-center gap-2">
            <SeverityIcon severity="warning" />
            {tr.import.error[read.code]}
          </p>
        ) : null}
      </div>
      {failed && (
        <p role="alert" className="mt-2 flex items-center gap-2 text-sm">
          <SeverityIcon severity="error" />
          {tr.import.failed}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={() => ref.current?.close()}
          className="h-8 rounded-chip border border-line px-3 text-sm hover:bg-panel"
        >
          {tr.import.cancel}
        </button>
        <button
          disabled={!read?.ok || busy}
          onClick={() => void submit()}
          className="h-8 rounded-chip bg-ink px-3 text-sm font-medium text-raised disabled:opacity-50"
        >
          {tr.import.submit}
        </button>
      </div>
    </dialog>
  );
}
