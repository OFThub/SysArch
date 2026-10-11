import { Share2 } from 'lucide-react';
import { useRef, useState, type ToggleEvent } from 'react';
import {
  createShare,
  getShare,
  revokeShare,
  setShareComments,
  type ShareLink,
} from '../api/client';
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
  // Undefined until the server answers.
  const [link, setLink] = useState<ShareLink | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = tr.share;
  const token = link?.token;
  const url = token ? `${window.location.origin}/s/${token}` : '';

  const onToggle = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== 'open' || !button.current || !menu.current || !projectId) return;
    const r = button.current.getBoundingClientRect();
    menu.current.style.top = `${r.bottom + 6}px`;
    menu.current.style.left = `${Math.max(8, r.right - menu.current.offsetWidth)}px`;
    setNotice(null);
    getShare(projectId)
      .then(setLink)
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
            <label className="mt-1 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={link?.comments ?? false}
                disabled={busy}
                onChange={(e) => {
                  const on = e.target.checked;
                  // Flips at once; flips back if the server refuses.
                  const flip = (to: boolean) => setLink((l) => l && { ...l, comments: to });
                  flip(on);
                  void run(async () => {
                    try {
                      setLink(await setShareComments(projectId!, on));
                    } catch (error) {
                      flip(!on);
                      throw error;
                    }
                  });
                }}
                className="mt-0.5 size-3.5 shrink-0 accent-[var(--ink)]"
              />
              <span>
                {t.allowComments}
                <span className="block text-xs text-ink-muted">{t.allowCommentsHint}</span>
              </span>
            </label>
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
                    setLink({ token: null, comments: false });
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
          link?.token === null && (
            <button
              disabled={busy || !projectId}
              onClick={() => void run(async () => setLink(await createShare(projectId!)))}
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
