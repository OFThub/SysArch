import { ClipSchema, copySubgraph } from '@sysarch/shared';
import { useEffect } from 'react';
import { archEdgeId, buildFlow } from '../canvas/viewModel';
import { redo, undo, useEditor } from '../store';

const PASTE_OFFSET = { x: 32, y: 32 };

// Shortcuts must never steal keys from a field the user is typing in. That
// includes editors built on EditContext (Monaco in Chromium), whose input is
// a plain element rather than a textarea.
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      Boolean((target as { editContext?: unknown }).editContext))
  );
}

/**
 * Editor keyboard shortcuts and clipboard. Copy/paste use the document's
 * copy/paste events: no clipboard permission prompt, and a clip copied in one
 * tab pastes in another. Pasted text is untrusted and validated before use.
 */
export function useShortcuts(requestDelete: (nodeIds: string[], edgeIds: string[]) => void) {
  useEffect(() => {
    const state = () => useEditor.getState();

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const { selection, doc, activeViewId, setSelection, paste } = state();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'a') {
        e.preventDefault();
        const model = buildFlow(doc, activeViewId);
        setSelection({
          nodeIds: model.nodes.filter((n) => !n.data.proxy).map((n) => n.id),
          edgeIds: [...new Set(model.edges.map((x) => archEdgeId(x.id)))],
        });
      } else if (mod && key === 'd') {
        e.preventDefault();
        if (selection.nodeIds.length)
          paste(copySubgraph(doc, selection.nodeIds, activeViewId), PASTE_OFFSET);
      } else if (key === 'delete' || key === 'backspace') {
        if (selection.nodeIds.length || selection.edgeIds.length) {
          e.preventDefault();
          requestDelete(selection.nodeIds, selection.edgeIds);
        }
      } else if (key === 'escape') {
        setSelection({ nodeIds: [], edgeIds: [] });
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement)) return;
      const { selection, doc, activeViewId } = state();
      if (!selection.nodeIds.length || !e.clipboardData) return;
      e.clipboardData.setData(
        'text/plain',
        JSON.stringify(copySubgraph(doc, selection.nodeIds, activeViewId)),
      );
      e.preventDefault();
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement)) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return; // Not ours; leave the paste alone.
      }
      const clip = ClipSchema.safeParse(parsed);
      if (!clip.success) return;
      e.preventDefault();
      state().paste(clip.data, PASTE_OFFSET);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [requestDelete]);
}
