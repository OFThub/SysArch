import type { Catalog } from '../catalog';
import { ImportError, type Imported } from './common';
import { fromCompose } from './compose';
import { fromMermaid } from './mermaid';
import { fromWokwi } from './wokwi';

export type SourceFormat = 'compose' | 'mermaid' | 'wokwi';

/**
 * Any supported source, told apart by content rather than file name: a JSON
 * object is a Wokwi diagram, a flowchart (bare, or in a ```mermaid fence as
 * READMEs have it) is Mermaid, anything else is tried as docker-compose.
 */
export function readSource(text: string, catalog: Catalog): Imported & { format: SourceFormat } {
  const t = text.trim();
  if (!t) throw new ImportError('empty');
  const fenced = /```mermaid[^\n]*\n([\s\S]*?)```/.exec(t)?.[1];
  if (fenced !== undefined || /^(%%[^\n]*\n\s*)*(flowchart|graph)\b/i.test(t))
    return { ...fromMermaid(fenced ?? t, catalog), format: 'mermaid' };
  if (t.startsWith('{')) return { ...fromWokwi(t, catalog), format: 'wokwi' };
  return { ...fromCompose(t, catalog), format: 'compose' };
}
