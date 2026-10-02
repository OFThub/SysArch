import { useEffect, useState } from 'react';
import { authClient } from '../api/client';
import { tr } from '../i18n/tr';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type Key = {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: Date | string;
  lastRequest: Date | string | null;
};

const day = new Intl.DateTimeFormat('tr', { dateStyle: 'medium' });

/** Personal API keys for MCP clients. A new key is shown once, then only its first characters. */
export function ApiKeys() {
  const [keys, setKeys] = useState<Key[] | 'failed' | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toRevoke, setToRevoke] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);

  // Bumped to refetch after a change.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  useEffect(() => {
    let current = true;
    void authClient.apiKey
      .list()
      .then((r) => current && setKeys(r.error ? 'failed' : (r.data.apiKeys as Key[])));
    return () => {
      current = false;
    };
  }, [version]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await authClient.apiKey.create({ name: tr.keys.defaultName });
      if (r.data) {
        setFresh(r.data.key);
        setCopied(false);
      }
      reload();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: Key) => {
    setToRevoke(null);
    await authClient.apiKey.delete({ keyId: key.id });
    reload();
  };

  const setup = fresh && `SYSARCH_URL=${window.location.origin}\nSYSARCH_API_KEY=${fresh}`;

  return (
    <section className="mt-14 grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-wide text-md font-semibold">{tr.keys.title}</h2>
        <button
          disabled={busy}
          onClick={() => void create()}
          className="h-8 rounded-chip border border-line bg-raised px-3 text-sm hover:border-ink-muted disabled:opacity-50"
        >
          {tr.keys.create}
        </button>
      </div>
      <p className="max-w-prose text-sm text-ink-muted">{tr.keys.lead}</p>

      {setup && (
        <div role="status" className="grid gap-2 rounded-chip border border-line bg-raised p-3">
          <p className="text-sm">{tr.keys.created}</p>
          <p className="text-xs text-ink-muted">{tr.keys.setup}</p>
          <pre className="overflow-x-auto font-mono text-xs">{setup}</pre>
          <button
            onClick={() => void navigator.clipboard.writeText(setup).then(() => setCopied(true))}
            className="h-7 justify-self-start rounded-chip border border-line px-2.5 text-sm hover:border-ink-muted"
          >
            {copied ? tr.keys.copied : tr.keys.copy}
          </button>
        </div>
      )}

      {keys === 'failed' && <p className="text-sm">{tr.keys.failed}</p>}
      {Array.isArray(keys) && keys.length === 0 && (
        <p className="text-sm text-ink-muted">{tr.keys.none}</p>
      )}
      {Array.isArray(keys) && keys.length > 0 && (
        <table className="w-full border-t border-line text-left">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th className="py-2 font-medium">{tr.inspector.name}</th>
              <th className="py-2 font-medium">{tr.keys.created_at}</th>
              <th className="py-2 font-medium">{tr.keys.lastUsed}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} className="border-t border-line text-sm">
                <td className="py-2.5">
                  {key.name}{' '}
                  {key.start && (
                    <span className="font-mono text-xs text-ink-muted">{key.start}…</span>
                  )}
                </td>
                <td className="py-2.5 text-ink-muted">{day.format(new Date(key.createdAt))}</td>
                <td className="py-2.5 text-ink-muted">
                  {key.lastRequest ? day.format(new Date(key.lastRequest)) : tr.keys.never}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => setToRevoke(key)}
                    className="text-sm text-ink-muted hover:text-ink"
                  >
                    {tr.keys.revoke}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {toRevoke && (
        <ConfirmDialog
          title={tr.keys.revokeTitle}
          body={tr.keys.revokeBody(toRevoke.name ?? toRevoke.start ?? '')}
          confirmLabel={tr.keys.revoke}
          cancelLabel={tr.keys.cancel}
          onCancel={() => setToRevoke(null)}
          onConfirm={() => void revoke(toRevoke)}
        />
      )}
    </section>
  );
}
