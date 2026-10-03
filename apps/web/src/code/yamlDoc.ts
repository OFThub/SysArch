import {
  ArchDocSchema,
  MIGRATIONS,
  SCHEMA_VERSION,
  removeElements,
  upgrade,
  type ArchDoc,
} from '@sysarch/shared';
import { isNode, LineCounter, parseDocument, stringify, type Document } from 'yaml';
import { z } from 'zod';
import { tr } from '../i18n/tr';

/** A problem in the editor text, 1-based like Monaco's positions. */
export interface CodeError {
  line: number;
  col: number;
  message: string;
}

/** The doc as the code editor shows it: the architecture without its layout. */
export function toYaml(doc: ArchDoc): string {
  const { views: _, ...rest } = doc;
  return stringify(rest);
}

/**
 * Reads editor text back into a doc. Layout stays the current doc's: its
 * views are kept minus what removed nodes leave behind, and new nodes are
 * placed on the next layout. Every error points at the line it comes from.
 */
export function fromYaml(
  text: string,
  current: ArchDoc,
): { doc: ArchDoc } | { errors: CodeError[] } {
  const lines = new LineCounter();
  const src = parseDocument(text, { lineCounter: lines });
  if (src.errors.length)
    return {
      errors: src.errors.map((e) => ({
        line: e.linePos?.[0].line ?? 1,
        col: e.linePos?.[0].col ?? 1,
        message: SYNTAX[e.code] ?? tr.code.syntax,
      })),
    };

  const js: unknown = src.toJS();
  if (typeof js !== 'object' || js === null || Array.isArray(js))
    return { errors: [{ line: 1, col: 1, message: tr.code.notMap }] };
  let raw: Record<string, unknown>;
  try {
    raw = upgrade(js, MIGRATIONS, SCHEMA_VERSION);
  } catch {
    return { errors: [{ ...locate(src, lines, ['version']), message: tr.code.version }] };
  }

  const ids = new Set(Array.isArray(raw.nodes) ? raw.nodes.map((n) => n?.id) : []);
  const gone = current.nodes.filter((n) => !ids.has(n.id)).map((n) => n.id);
  const { views } = removeElements(current, gone, []);
  const parsed = ArchDocSchema.safeParse({ ...raw, views }, { error: z.locales.tr().localeError });
  if (parsed.success) return { doc: parsed.data };
  return {
    errors: parsed.error.issues.map((i) => ({
      ...locate(src, lines, i.path),
      message: translate(i.message),
    })),
  };
}

/** The deepest node on `path` that exists in the text; a missing key points at its parent. */
function locate(src: Document, lines: LineCounter, path: PropertyKey[]) {
  for (let p = path; ; p = p.slice(0, -1)) {
    const node = p.length ? src.getIn(p, true) : src.contents;
    if (isNode(node) && node.range) return lines.linePos(node.range[0]);
    if (!p.length) return { line: 1, col: 1 };
  }
}

const SYNTAX: Record<string, string> = {
  BAD_INDENT: tr.code.indent,
  TAB_AS_INDENT: tr.code.tabIndent,
  DUPLICATE_KEY: tr.code.duplicateKey,
  MISSING_CHAR: tr.code.missingChar,
};

// The schema's integrity messages stay English for the assistant and MCP;
// the editor shows them in Turkish. Anything unmatched falls through as is.
const INTEGRITY: [RegExp, (id: string) => string][] = [
  [/^duplicate id "(.*)"$/, tr.code.duplicateId],
  [/^duplicate type "(.*)"$/, tr.code.duplicateType],
  [/^unknown node "(.*)"$/, tr.code.unknownNode],
  [/^unknown edge "(.*)"$/, tr.code.unknownEdge],
  [/^parent cycle at "(.*)"$/, tr.code.parentCycle],
  [/^edge cannot connect a node to itself$/, () => tr.code.selfEdge],
];

function translate(message: string) {
  for (const [re, fn] of INTEGRITY) {
    const m = re.exec(message);
    if (m) return fn(m[1] ?? '');
  }
  return message;
}
