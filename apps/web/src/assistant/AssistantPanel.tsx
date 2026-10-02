import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { tr } from '../i18n/tr';
import { openProposal, useProposals } from '../proposals/store';
import { showSideTab } from '../shell/SidePanel';
import { useEditor } from '../store';
import { SeverityIcon } from '../ui/SeverityIcon';
import { sendMessage, useAssistant, type ChatMessage } from './store';

/** The project chat: ask about the architecture or ask for a change, which arrives as a proposal. */
export function AssistantPanel() {
  const { available, messages, draft, busy, error } = useAssistant(
    useShallow((s) => ({
      available: s.available,
      messages: s.messages,
      draft: s.draft,
      busy: s.busy,
      error: s.error,
    })),
  );
  const projectId = useEditor((s) => s.project?.id);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, which
  // React would take for a cleanup function.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, draft, error]);

  if (available === null) return null;
  if (!available) return <p className="p-4 text-sm text-ink-muted">{tr.assistant.unavailable}</p>;

  const submit = () => {
    const message = text.trim();
    if (!message || busy || !projectId) return;
    setText('');
    void sendMessage(projectId, message);
  };

  return (
    <div className="flex h-full flex-col">
      <div
        aria-live="polite"
        className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4"
      >
        {messages.length === 0 && !busy && (
          <p className="text-sm text-ink-muted">{tr.assistant.empty}</p>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {busy &&
          (draft ? (
            <Message
              message={{ id: 'draft', role: 'assistant', content: draft, proposalId: null }}
            />
          ) : (
            <p role="status" className="text-sm text-ink-muted">
              {tr.assistant.thinking}
            </p>
          ))}
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">
              <SeverityIcon severity="error" />
            </span>
            {error}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid shrink-0 gap-2 border-t border-line p-3"
      >
        <textarea
          aria-label={tr.assistant.placeholder}
          placeholder={tr.assistant.placeholder}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none rounded-chip border border-line bg-raised px-2 py-1.5 text-sm placeholder:text-ink-muted"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="h-8 justify-self-end rounded-chip bg-ink px-3 text-sm font-medium text-raised disabled:opacity-50"
        >
          {tr.assistant.send}
        </button>
      </form>
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const { proposalId } = message;
  // Only a proposal that still waits can be opened; applied or rejected ones are history.
  const pending = useProposals(
    (s) => proposalId !== null && s.list.some((p) => p.id === proposalId),
  );
  const mine = message.role === 'user';
  return (
    <div className="grid gap-1">
      <span className="text-xs text-ink-muted">{mine ? tr.assistant.you : tr.assistant.name}</span>
      <p
        className={`text-sm whitespace-pre-wrap ${mine ? 'rounded-chip border border-line bg-raised px-3 py-2' : ''}`}
      >
        {message.content}
      </p>
      {pending && (
        <button
          onClick={() => {
            showSideTab('proposals');
            openProposal(proposalId!);
          }}
          className="h-7 justify-self-start rounded-chip border border-line bg-raised px-2.5 text-sm hover:border-ink-muted"
        >
          {tr.assistant.review}
        </button>
      )}
    </div>
  );
}
