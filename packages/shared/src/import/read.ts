import type { Catalog } from '../catalog';
import { ImportError, type Imported } from './common';
import { fromCompose } from './compose';
import { fromMermaid } from './mermaid';
import { fromTerraform } from './terraform';
import { fromWokwi } from './wokwi';

export type SourceFormat = 'compose' | 'mermaid' | 'wokwi' | 'terraform';

/**
 * Any supported source, told apart by content rather than file name: JSON
 * with a format_version is `terraform show -json` output, other JSON is a
 * Wokwi diagram, a flowchart (bare, or in a ```mermaid fence as READMEs
 * have it) is Mermaid, anything else is tried as docker-compose.
 */
export function readSource(text: string, catalog: Catalog): Imported & { format: SourceFormat } {
  const t = text.trim();
  if (!t) throw new ImportError('empty');
  const fenced = /```mermaid[^\n]*\n([\s\S]*?)```/.exec(t)?.[1];
  if (fenced !== undefined || /^(%%[^\n]*\n\s*)*(flowchart|graph)\b/i.test(t))
    return { ...fromMermaid(fenced ?? t, catalog), format: 'mermaid' };
  if (t.startsWith('{'))
    return /"format_version"\s*:/.test(t)
      ? { ...fromTerraform(t, catalog), format: 'terraform' }
      : { ...fromWokwi(t, catalog), format: 'wokwi' };
  return { ...fromCompose(t, catalog), format: 'compose' };
}
