import {
  defaultProps,
  DOMAINS,
  newId,
  nodeFromPreset,
  PRESETS,
  type ArchNode,
  type Catalog,
  type Domain,
} from '@sysarch/shared';

export interface PaletteItem {
  key: string;
  kind: 'type' | 'preset';
  id: string;
  domain: Domain;
  label: string;
  /** For presets: the generic type they fill in. */
  typeLabel?: string;
  icon: string;
}

export interface PaletteSection {
  domain: Domain;
  types: PaletteItem[];
  presets: PaletteItem[];
}

// Turkish casing so "ı/I" and "i/İ" match the way people type them.
const norm = (s: string) => s.toLocaleLowerCase('tr');

/** Palette contents for a domain tab (or every domain in the overview), filtered by a query. */
export function paletteSections(
  catalog: Catalog,
  domain: Domain | undefined,
  query: string,
): PaletteSection[] {
  const q = norm(query.trim());
  const matches = (...texts: (string | undefined)[]) =>
    !q || texts.some((t) => t !== undefined && norm(t).includes(q));

  return DOMAINS.filter((d) => !domain || d === domain)
    .map((d) => {
      const types = [...catalog.values()]
        .filter((t) => t.domain === d && matches(t.label, t.type))
        .map((t) => ({
          key: `type:${t.type}`,
          kind: 'type' as const,
          id: t.type,
          domain: d,
          label: t.label,
          icon: t.icon,
        }));
      const presets = PRESETS.filter((p) => catalog.get(p.type)?.domain === d)
        .map((p) => ({ p, t: catalog.get(p.type)! }))
        .filter(({ p, t }) => matches(p.label, p.id, t.label))
        .map(({ p, t }) => ({
          key: `preset:${p.id}`,
          kind: 'preset' as const,
          id: p.id,
          domain: d,
          label: p.label,
          typeLabel: t.label,
          icon: t.icon,
        }));
      return { domain: d, types, presets };
    })
    .filter((s) => s.types.length + s.presets.length > 0);
}

/** A fresh node for a palette item, with type defaults (and preset values/pins). */
export function createNode(item: Pick<PaletteItem, 'kind' | 'id'>, catalog: Catalog): ArchNode {
  if (item.kind === 'preset') {
    const preset = PRESETS.find((p) => p.id === item.id);
    if (!preset) throw new Error(`unknown preset ${item.id}`);
    return nodeFromPreset(preset, catalog, newId());
  }
  const type = catalog.get(item.id);
  if (!type) throw new Error(`unknown type ${item.id}`);
  return {
    id: newId(),
    domain: type.domain,
    type: type.type,
    label: type.label,
    props: defaultProps(type),
  };
}
