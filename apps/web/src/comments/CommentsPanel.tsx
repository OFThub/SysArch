import type { ArchDoc } from '@sysarch/shared';
import { Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { viewForIssue } from '../analysis/issues';
import { canvasApi } from '../canvas/canvasApi';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ago } from '../ui/time';
import { deleteComment, postComment, setResolved, useComments } from './store';
import {
  orderThreads,
  targetLabel,
  targetOf,
  threadsOf,
  type Comment,
  type Target,
  type Thread,
} from './threads';

type Props = {
  doc: ArchDoc;
  /** What a new thread is about. */
  focus: Target;
  /** Whether this reader writes; when not, `signIn` takes the composer's place. */
  canWrite: boolean;
  canResolve: boolean;
  signIn?: ReactNode;
  /** Brings a thread's subject into view. */
  onShow?: (target: Target) => void;
};

/**
 * The design's comment threads: a box for a new one about the selection,
 * open threads (about the selection first), then resolved ones folded away.
 */
export function CommentsPanel({ doc, focus, canWrite, canResolve, signIn, onShow }: Props) {
  const { list, status, notice } = useComments();
  const { open, resolved } = useMemo(() => orderThreads(threadsOf(list), focus), [list, focus]);
  const t = tr.comments;
  const thread = (th: Thread) => (
    <ThreadView
      key={th.root.id}
      thread={th}
      doc={doc}
      canWrite={canWrite}
      canResolve={canResolve}
      onShow={onShow}
    />
  );

  return (
    <div className="flex flex-col">
      {canWrite ? (
        <Composer
          key={JSON.stringify(focus)}
          about={targetLabel(doc, {
            targetKind: focus.kind,
            targetId: 'id' in focus ? focus.id : null,
          })}
          placeholder={t.write}
          submit={(body) => postComment({ body, target: focus })}
        />
      ) : (
        signIn
      )}
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="border-b border-line px-4 py-2 text-sm text-ink-muted"
        >
          {notice.text}
        </p>
      )}
      {status === 'error' ? (
        <p role="alert" className="p-4 text-sm text-ink-muted">
          {t.unavailable}
        </p>
      ) : (
        status === 'ready' &&
        !list.length && (
          <p className="p-4 text-sm text-ink-muted">{canResolve ? t.empty : t.emptyShared}</p>
        )
      )}
      <ul>{open.map(thread)}</ul>
      {resolved.length > 0 && (
        <details className="border-b border-line">
          <summary className="cursor-pointer px-4 py-2 text-sm text-ink-muted hover:text-ink">
            {t.resolved(resolved.length)}
          </summary>
          <ul className="opacity-75">{resolved.map(thread)}</ul>
        </details>
      )}
    </div>
  );
}

/** The editor's comments: about the selection, and a thread's subject opens on the canvas. */
export function EditorComments() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const focus = useMemo(() => targetOf(selection), [selection]);
  return <CommentsPanel doc={doc} focus={focus} canWrite canResolve onShow={showInEditor} />;
}

function showInEditor(target: Target) {
  if (target.kind === 'project') return;
  const { doc, activeViewId, setActiveView, setSelection } = useEditor.getState();
  const edge = target.kind === 'edge' ? doc.edges.find((e) => e.id === target.id) : undefined;
  const nodeIds = target.kind === 'node' ? [target.id] : edge ? [edge.source, edge.target] : [];
  if (!nodeIds.length) return;
  const view = viewForIssue(doc, activeViewId, { nodeIds });
  if (view !== activeViewId) setActiveView(view);
  setSelection(
    target.kind === 'node' ? { nodeIds, edgeIds: [] } : { nodeIds: [], edgeIds: [target.id] },
  );
  // After a view switch the canvas remounts; give it a moment to measure.
  setTimeout(() => canvasApi.fitNodes(nodeIds), view === activeViewId ? 0 : 80);
}

function ThreadView({
  thread: { root, replies },
  doc,
  canWrite,
  canResolve,
  onShow,
}: {
  thread: Thread;
  doc: ArchDoc;
  canWrite: boolean;
  canResolve: boolean;
  onShow?: (target: Target) => void;
}) {
  const [replying, setReplying] = useState(false);
  const busy = useComments((s) => s.busy);
  const t = tr.comments;
  const subject = targetLabel(doc, root);
  const target: Target =
    root.targetKind === 'project'
      ? { kind: 'project' }
      : { kind: root.targetKind, id: root.targetId ?? '' };
  const showable = !!onShow && subject.present && target.kind !== 'project';

  return (
    <li className="border-b border-line px-4 py-3">
      <button
        disabled={!showable}
        onClick={() => onShow?.(target)}
        aria-label={`${t.about}: ${subject.text}`}
        className={`max-w-full truncate rounded-chip border border-line px-1.5 text-xs text-ink-muted enabled:hover:text-ink ${subject.present ? '' : 'line-through'}`}
      >
        {subject.text}
      </button>
      <CommentView comment={root} replies={replies.length} />
      {replies.length > 0 && (
        <div className="mt-1 ml-1 border-l border-line pl-3">
          {replies.map((r) => (
            <CommentView key={r.id} comment={r} replies={0} />
          ))}
        </div>
      )}
      {replying ? (
        <Composer
          placeholder={t.writeReply}
          submit={async (body) => {
            const ok = await postComment({ body, parentId: root.id });
            if (ok) setReplying(false);
            return ok;
          }}
          onCancel={() => setReplying(false)}
          inline
        />
      ) : (
        (canWrite || canResolve) && (
          <div className="mt-2 flex gap-3 text-sm">
            {canWrite && (
              <button onClick={() => setReplying(true)} className="text-ink-muted hover:text-ink">
                {t.reply}
              </button>
            )}
            {canResolve && (
              <button
                disabled={busy}
                onClick={() => void setResolved(root.id, !root.resolvedAt)}
                className="text-ink-muted hover:text-ink disabled:opacity-50"
              >
                {root.resolvedAt ? t.reopen : t.resolve}
              </button>
            )}
          </div>
        )
      )}
    </li>
  );
}

function CommentView({ comment: c, replies }: { comment: Comment; replies: number }) {
  const [confirm, setConfirm] = useState(false);
  const t = tr.comments;
  return (
    <div className="mt-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{c.author}</span>
        <time
          dateTime={c.createdAt}
          title={new Date(c.createdAt).toLocaleString('tr')}
          className="text-xs text-ink-muted"
        >
          {ago(c.createdAt)}
        </time>
        {c.canDelete && (
          <button
            onClick={() => setConfirm(true)}
            aria-label={t.remove}
            title={t.remove}
            className="ml-auto self-center text-ink-muted hover:text-ink"
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>
      {/* Plain text: whatever a visitor typed is shown, never interpreted. */}
      <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
      {confirm && (
        <ConfirmDialog
          title={t.removeTitle}
          body={t.removeThread(replies)}
          confirmLabel={t.remove}
          cancelLabel={t.cancel}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            void deleteComment(c.id);
          }}
        />
      )}
    </div>
  );
}

/** A text box with its send button; Ctrl+Enter sends too. */
function Composer({
  about,
  placeholder,
  submit,
  onCancel,
  inline = false,
}: {
  about?: { text: string; present: boolean };
  placeholder: string;
  submit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
  inline?: boolean;
}) {
  const [body, setBody] = useState('');
  const busy = useComments((s) => s.busy);
  const t = tr.comments;
  const send = async () => {
    if (body.trim() && (await submit(body.trim()))) setBody('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className={inline ? 'mt-2' : 'border-b border-line p-4'}
    >
      {about && (
        <p className="mb-1.5 truncate text-xs text-ink-muted">
          {t.about}: <span className="text-ink">{about.text}</span>
        </p>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
        aria-label={placeholder}
        placeholder={placeholder}
        maxLength={2000}
        rows={inline ? 2 : 3}
        autoFocus={inline}
        className="block w-full resize-y rounded-chip border border-line bg-raised px-2 py-1.5 text-sm"
      />
      <div className="mt-2 flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-7 rounded-chip border border-line px-2.5 text-sm hover:bg-panel"
          >
            {t.cancel}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="h-7 rounded-chip bg-ink px-2.5 text-sm font-medium text-raised disabled:opacity-50"
        >
          {inline ? t.addReply : t.add}
        </button>
      </div>
    </form>
  );
}
