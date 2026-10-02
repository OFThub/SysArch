import type { Proposal } from '@sysarch/server/api';
import { create } from 'zustand';
import { api } from '../api/client';
import { tr } from '../i18n/tr';
import { refreshProposals } from '../proposals/store';
import { useEditor } from '../store';
import { sseParser } from './sse';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** The proposal this reply produced, to review from the chat. */
  proposalId: string | null;
}

interface AssistantState {
  /** null until the server has said whether a model key is configured. */
  available: boolean | null;
  messages: ChatMessage[];
  /** The reply as it streams in. */
  draft: string;
  busy: boolean;
  error: string | null;
}

const initial: AssistantState = {
  available: null,
  messages: [],
  draft: '',
  busy: false,
  error: null,
};
export const useAssistant = create<AssistantState>(() => initial);
const set = useAssistant.setState;

export async function loadChat(projectId: string) {
  set({ ...initial });
  try {
    const res = await api.projects[':id'].assistant.$get({ param: { id: projectId } });
    if (!res.ok) return set({ available: false });
    const body = await res.json();
    set({ available: body.available, messages: body.messages });
  } catch {
    set({ available: false });
  }
}

let localId = 0;

/**
 * Sends a message with the current view and selection ("this"), streams the
 * reply into `draft`, and on completion lists the proposal it produced.
 */
export async function sendMessage(projectId: string, message: string) {
  const { activeViewId, selection } = useEditor.getState();
  set((s) => ({
    busy: true,
    error: null,
    draft: '',
    messages: [
      ...s.messages,
      { id: `local-${++localId}`, role: 'user', content: message, proposalId: null },
    ],
  }));
  try {
    const res = await api.projects[':id'].assistant.$post({
      param: { id: projectId },
      json: { message, viewId: activeViewId, selection },
    });
    if (!res.ok || !res.body) {
      set({ error: res.status === 429 ? tr.assistant.limited : tr.assistant.failed });
      return;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const feed = sseParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const e of feed(value)) {
        if (e.event === 'text') {
          set((s) => ({ draft: s.draft + (JSON.parse(e.data) as string) }));
        } else if (e.event === 'done') {
          const d = JSON.parse(e.data) as {
            text: string;
            refused: boolean;
            proposal: Proposal | null;
          };
          set((s) => ({
            messages: [
              ...s.messages,
              {
                id: `local-${++localId}`,
                role: 'assistant',
                content: d.text,
                proposalId: d.proposal?.id ?? null,
              },
            ],
            error: d.refused ? tr.assistant.refused : null,
          }));
          if (d.proposal) void refreshProposals(projectId);
        } else if (e.event === 'error') {
          set({ error: tr.assistant.failed });
        }
      }
    }
  } catch {
    set({ error: tr.assistant.failed });
  } finally {
    set({ busy: false, draft: '' });
  }
}
