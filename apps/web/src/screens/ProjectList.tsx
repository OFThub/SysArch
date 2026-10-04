import { DOMAINS, TEMPLATES, type ArchDoc } from '@sysarch/shared';
import { useEffect, useState } from 'react';
import { api, authClient } from '../api/client';
import { tr } from '../i18n/tr';
import { navigate } from '../nav';
import { ThemeSwitch } from '../shell/ThemeSwitch';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ApiKeys } from './ApiKeys';

type Row = { id: string; name: string; updatedAt: string };

/** Each starter design, built once, with the domains it spans. */
const templates = TEMPLATES.map(({ id, build }) => {
  const doc = build();
  return { id, doc, domains: DOMAINS.filter((d) => doc.nodes.some((n) => n.domain === d)) };
});

const relative = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

export function ProjectList({ userName }: { userName: string }) {
  const [rows, setRows] = useState<Row[] | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  // Bumped to refetch after a change.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    api.projects
      .$get()
      .then(async (res) => (res.ok ? (await res.json()).projects : ('failed' as const)))
      .catch(() => 'failed' as const)
      .then((next) => current && setRows(next));
    return () => {
      current = false;
    };
  }, [version]);

  const create = async (doc?: ArchDoc) => {
    setBusy(true);
    try {
      const res = await api.projects.$post({
        json: doc ? { name: doc.meta.name, doc } : { name: tr.projects.untitled },
      });
      if (res.ok) navigate(`/p/${(await res.json()).id}`);
      else setRows('failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Row) => {
    setToDelete(null);
    await api.projects[':id'].$delete({ param: { id: row.id } });
    setVersion((v) => v + 1);
  };

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
        <span className="font-wide text-md font-semibold">SysArch</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-ink-muted">{userName}</span>
          <button
            onClick={() => void authClient.signOut().then(() => window.location.assign('/'))}
            className="text-sm text-ink-muted hover:text-ink"
          >
            {tr.projects.signOut}
          </button>
          <ThemeSwitch />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto font-wide text-xl font-semibold">{tr.projects.title}</h1>
          <button
            disabled={busy}
            onClick={() => void create()}
            className="h-8 rounded-chip bg-ink px-3 text-sm font-medium text-raised disabled:opacity-50"
          >
            {tr.projects.newEmpty}
          </button>
        </div>

        <section className="mt-8">
          <h2 className="font-wide text-md font-semibold">{tr.projects.templatesTitle}</h2>
          <ul className="mt-3 border-b border-line">
            {templates.map(({ id, doc, domains }) => (
              <li key={id} className="border-t border-line">
                <button
                  disabled={busy}
                  onClick={() => void create(doc)}
                  aria-label={tr.projects.fromTemplate(doc.meta.name)}
                  className="flex w-full items-baseline gap-4 py-2.5 text-left hover:bg-panel disabled:opacity-50"
                >
                  <span className="w-56 shrink-0 font-medium">{doc.meta.name}</span>
                  <span className="flex-1 text-sm text-ink-muted">{tr.projects.templates[id]}</span>
                  {/* The domains it spans, in the channel colors of the tabs. */}
                  <span
                    className="flex shrink-0 gap-1.5"
                    title={domains.map((d) => tr.domain[d]).join(', ')}
                  >
                    {domains.map((d) => (
                      <span
                        key={d}
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ background: `var(--ch-${d})` }}
                      />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {rows === 'failed' && <p className="mt-8">{tr.projects.loadFailed}</p>}
        {Array.isArray(rows) && rows.length === 0 && (
          <p className="mt-8 text-ink-muted">{tr.projects.empty}</p>
        )}
        {Array.isArray(rows) && rows.length > 0 && (
          <table className="mt-8 w-full border-t border-line text-left">
            <thead>
              <tr className="text-xs text-ink-muted">
                <th className="py-2 font-medium">{tr.inspector.name}</th>
                <th className="py-2 font-medium">{tr.projects.updated}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="py-2.5">
                    <a
                      href={`/p/${row.id}`}
                      aria-label={tr.projects.open(row.name)}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/p/${row.id}`);
                      }}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </a>
                  </td>
                  <td className="py-2.5 text-sm text-ink-muted">{ago(row.updatedAt)}</td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => setToDelete(row)}
                      className="text-sm text-ink-muted hover:text-ink"
                    >
                      {tr.projects.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <ApiKeys />
      </main>

      {toDelete && (
        <ConfirmDialog
          title={tr.projects.deleteTitle}
          body={tr.projects.deleteBody(toDelete.name)}
          confirmLabel={tr.projects.delete}
          cancelLabel={tr.projects.cancel}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove(toDelete)}
        />
      )}
    </div>
  );
}
