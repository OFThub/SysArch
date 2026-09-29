import { tr } from '../i18n/tr';
import { useSaveStatus } from '../sync/autosave';
import { SeverityIcon } from '../ui/SeverityIcon';

/** Quiet when all is well; shape-coded when something needs the user. */
export function SaveStatus({ onRetry }: { onRetry: () => void }) {
  const status = useSaveStatus();
  switch (status.state) {
    case 'saved':
    case 'pending':
    case 'saving':
      return (
        <span role="status" className="text-sm text-ink-muted">
          {tr.save[status.state]}
        </span>
      );
    case 'invalid':
      return (
        <span role="status" title={status.issue} className="flex items-center gap-1.5 text-sm">
          <SeverityIcon severity="warning" />
          {tr.save.invalid}
        </span>
      );
    case 'error':
      return (
        <span role="alert" className="flex items-center gap-1.5 text-sm">
          <SeverityIcon severity="error" />
          {tr.save.error}
          <button onClick={onRetry} className="underline underline-offset-2">
            {tr.save.retry}
          </button>
        </span>
      );
    case 'conflict':
      return null; // The banner below the header explains and offers the choices.
  }
}

export function ConflictBanner({
  onReload,
  onOverwrite,
}: {
  onReload: () => void;
  onOverwrite: (serverRevision: number) => void;
}) {
  const status = useSaveStatus();
  if (status.state !== 'conflict') return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-line bg-raised px-4 py-2 text-sm"
    >
      <SeverityIcon severity="warning" />
      <p className="flex-1">{tr.save.conflict}</p>
      <button
        onClick={onReload}
        className="h-7 rounded-chip border border-line px-2.5 hover:bg-panel"
      >
        {tr.save.reload}
      </button>
      <button
        onClick={() => onOverwrite(status.serverRevision)}
        className="h-7 rounded-chip border border-line px-2.5 hover:bg-panel"
      >
        {tr.save.overwrite}
      </button>
    </div>
  );
}
