import { Share2 } from 'lucide-react';
import { useRef, useState, type ToggleEvent } from 'react';
import { createShare, getShare, revokeShare } from '../api/client';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';

/**
 * The project's read-only link, in a popover under the header: make it,
 * copy it, or take it back (which stops the old link at once).
 */
export function ShareMenu() {
  const projectId = useEditor((s) => s.project?.id);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = tr.share;
  const url = token ? `${window.location.origin}/s/${token}` : '';

  const onToggle = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== 'open' || !button.current || !menu.current || !projectId) return;
    const r = button.current.getBoundingClientRect();
    menu.current.style.top = `${r.bottom + 6}px`;
    menu.current.style.left = `${Math.max(8, r.right - menu.current.offsetWidth)}px`;
    setNotice(null);
    getShare(projectId)
      .then(setToken)
      .catch(() => setNotice(t.failed));
  };

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await action();
      if (outcome) setNotice(outcome);
    } catch {
      setNotice(t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={button}
        popoverTarget="share-menu"
        aria-label={t.open}
        title={t.open}
        className="flex size-7 items-center justify-center text-ink-muted hover:text-ink"
      >
        <Share2 size={16} strokeWidth={1.5} aria-hidden />
      </button>
      <div
        ref={menu}
        id="share-menu"
        popover="auto"
        onToggle={onToggle}
        aria-label={t.open}
        className="fixed m-0 w-80 rounded-float border border-line bg-raised p-3 text-ink shadow-float"
      >
        <p className="text-sm text-ink-muted">{t.lead}</p>
        {token ? (
          <div className="mt-3 grid gap-2">
            <input
              readOnly
              aria-label={t.link}
              value={url}
              onFocus={(e) => e.target.select()}
              className="h-7 w-full rounded-chip border border-line bg-panel px-2 font-mono text-xs"
            />
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(url);
                    return t.copied;
                  })
                }
                className="h-7 rounded-chip bg-ink px-2.5 text-sm font-medium text-raised disabled:opacity-50"
              >
                {t.copy}
              </button>
              <button
                disabled={busy || !projectId}
                onClick={() =>
                  void run(async () => {
                    if (!(await revokeShare(projectId!))) return t.failed;
                    setToken(null);
                    return t.revoked;
                  })
                }
                className="h-7 rounded-chip border border-line px-2.5 text-sm hover:bg-panel disabled:opacity-50"
              >
                {t.revoke}
              </button>
            </div>
          </div>
        ) : (
          token === null && (
            <button
              disabled={busy || !projectId}
              onClick={() => void run(async () => setToken(await createShare(projectId!)))}
              className="mt-3 h-7 rounded-chip bg-ink px-2.5 text-sm font-medium text-raised disabled:opacity-50"
            >
              {t.create}
            </button>
          )
        )}
        {notice && (
          <p role="status" className="mt-2 text-sm text-ink-muted">
            {notice}
          </p>
        )}
      </div>
    </>
  );
}
