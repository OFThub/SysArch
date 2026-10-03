import type { ArchDoc } from '@sysarch/shared';
// The editor core, its features and YAML only, not every language Monaco ships.
// ponytail: register.all is ~1 MB gzip in a lazy chunk; import contribs one by
// one if opening the code tab gets slow.
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/yaml/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n/tr';
import { useEditor } from '../store';
import { SeverityIcon } from '../ui/SeverityIcon';
import { fromYaml, toYaml, type CodeError } from './yamlDoc';

// Only the base worker: YAML gets no language service, the doc schema checks it.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

const APPLY_MS = 400;
const SHOWN_ERRORS = 3;

/** A token's current color as hex: Monaco themes take literal colors, not CSS variables. */
function tokenHex(name: string) {
  const probe = document.createElement('i');
  probe.style.color = `var(--${name})`;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g)!.slice(0, 3).map(Number);
  probe.remove();
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Themes Monaco from the design tokens: keys muted, values in ink, no syntax rainbow. */
function applyTheme() {
  const c = tokenHex;
  const raised = c('raised');
  const ink = c('ink').slice(1);
  const muted = c('ink-muted').slice(1);
  monaco.editor.defineTheme('sysarch', {
    base: parseInt(raised.slice(1, 3), 16) < 128 ? 'vs-dark' : 'vs',
    inherit: true,
    // Base themes color `string.yaml` and friends; the suffixed form outranks a bare one.
    rules: [
      { token: '', foreground: ink },
      ...['string', 'number', 'keyword', 'operators', 'delimiter', 'tag', 'meta'].map((t) => ({
        token: `${t}.yaml`,
        foreground: ink,
      })),
      { token: 'type.yaml', foreground: muted },
      { token: 'comment.yaml', foreground: muted, fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': raised,
      'editor.foreground': c('ink'),
      'editorLineNumber.foreground': c('ink-muted'),
      'editorLineNumber.activeForeground': c('ink'),
      'editor.lineHighlightBorder': c('line'),
      'editor.selectionBackground': c('line'),
      'editorIndentGuide.background1': c('line'),
      'editorError.foreground': c('danger'),
      'editorWidget.background': c('panel'),
      'editorWidget.border': c('line'),
      // Shell surfaces carry no shadow: the sticky header is set off by a line.
      'scrollbar.shadow': '#00000000',
      'editorStickyScroll.shadow': '#00000000',
      'editorStickyScroll.border': c('line'),
      'editorStickyScroll.background': raised,
    },
  });
  monaco.editor.setTheme('sysarch');
}

/**
 * The design as YAML, editable. Valid text is applied after a short pause
 * (one undo step per burst of typing); invalid text marks its lines and the
 * canvas keeps the last valid design. Changes made elsewhere replace the text
 * only while it holds no unapplied edits and is not being typed in; otherwise
 * a strip offers to reload, and nothing is applied until then, so stale text
 * never undoes someone else's change.
 */
export default function CodePanel() {
  const host = useRef<HTMLDivElement>(null);
  const reload = useRef(() => {});
  const reveal = useRef((_: CodeError) => {});
  const [errors, setErrors] = useState<CodeError[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    applyTheme();
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    const themeAttr = new MutationObserver(applyTheme);
    themeAttr.observe(document.documentElement, { attributeFilter: ['data-theme'] });

    // `synced` is the text of the design the store holds; text that differs
    // has edits not applied yet (mid-pause, or invalid).
    let synced = toYaml(useEditor.getState().doc);
    let applied: ArchDoc | null = null;
    let isStale = false;
    const editor = monaco.editor.create(host.current!, {
      value: synced,
      language: 'yaml',
      theme: 'sysarch',
      ariaLabel: tr.code.editor,
      automaticLayout: true,
      fixedOverflowWidgets: true,
      minimap: { enabled: false },
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
      fontSize: 13,
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      tabSize: 2,
      padding: { top: 8 },
    });
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
    const model = editor.getModel()!;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      timer = undefined;
      const text = model.getValue();
      const { doc, applyCode } = useEditor.getState();
      const r = fromYaml(text, doc);
      const found = 'errors' in r ? r.errors : [];
      monaco.editor.setModelMarkers(
        model,
        'sysarch',
        found.map((e) => ({
          severity: monaco.MarkerSeverity.Error,
          message: e.message,
          startLineNumber: e.line,
          startColumn: e.col,
          endLineNumber: e.line,
          endColumn: e.col,
        })),
      );
      setErrors(found);
      if ('errors' in r || isStale) return;
      synced = text;
      if (toYaml(r.doc) === toYaml(doc)) return;
      applied = r.doc;
      applyCode(r.doc);
    };
    const changes = model.onDidChangeContent(() => {
      clearTimeout(timer);
      timer = setTimeout(check, APPLY_MS);
    });

    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc || s.doc === applied) return;
      const text = toYaml(s.doc);
      if (text === toYaml(prev.doc)) return; // only the layout moved
      if (!editor.hasTextFocus() && model.getValue() === synced) {
        synced = text;
        model.setValue(text);
      } else {
        isStale = true;
        setStale(true);
      }
    });

    reload.current = () => {
      isStale = false;
      setStale(false);
      synced = toYaml(useEditor.getState().doc);
      model.setValue(synced);
      editor.focus();
    };
    reveal.current = (e) => {
      editor.revealLineInCenter(e.line);
      editor.setPosition({ lineNumber: e.line, column: e.col });
      editor.focus();
    };

    return () => {
      // Leaving the tab mid-pause still applies what was typed.
      if (timer) {
        clearTimeout(timer);
        check();
      }
      changes.dispose();
      unsubscribe();
      editor.dispose();
      themeAttr.disconnect();
      media.removeEventListener('change', applyTheme);
    };
  }, []);

  return (
    // nokey: React Flow reads Space and modifier keys document-wide, and does
    // not see Monaco's EditContext input as a text field.
    <div className="nokey flex h-full flex-col">
      {stale ? (
        <div role="status" className="flex items-center gap-3 border-b border-line px-3 py-2">
          <SeverityIcon severity="warning" />
          <p className="flex-1 text-sm">{tr.code.stale}</p>
          <button
            onClick={() => reload.current()}
            className="h-7 shrink-0 rounded-chip border border-line bg-raised px-2.5 text-sm hover:border-ink-muted"
          >
            {tr.code.reload}
          </button>
        </div>
      ) : (
        <p className="border-b border-line px-3 py-2 text-sm text-ink-muted">{tr.code.hint}</p>
      )}
      <div ref={host} className="min-h-0 flex-1" />
      {errors.length > 0 && (
        <div className="grid gap-1 border-t border-line px-3 py-2 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <SeverityIcon severity="error" />
            {tr.code.errors(errors.length)}
          </p>
          <ul className="grid gap-0.5">
            {errors.slice(0, SHOWN_ERRORS).map((e, i) => (
              <li key={i}>
                <button
                  onClick={() => reveal.current(e)}
                  className="text-left text-ink-muted hover:text-ink"
                >
                  <span className="tabular-nums">{tr.code.line(e.line)}</span> {e.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
