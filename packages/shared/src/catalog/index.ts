import type { ArchNode, CatalogType, PinDef, Props } from '../schema';
import { BUILTIN_TYPES } from './types';

export { PROTOCOLS, type ProtocolInfo } from './protocols';
export { BUILTIN_TYPES } from './types';

export type Catalog = ReadonlyMap<string, CatalogType>;

/**
 * Built-in types plus the doc's own custom types. A custom type with a built-in
 * name wins: the doc is self-contained and its definitions are authoritative.
 */
export function effectiveCatalog(customTypes: readonly CatalogType[] = []): Catalog {
  return new Map([...BUILTIN_TYPES, ...customTypes].map((t) => [t.type, t]));
}

/** A node's concrete pins (from its preset) or, failing that, its type's pins. */
export function pinsOf(node: ArchNode, catalog: Catalog): PinDef[] {
  return node.pins ?? catalog.get(node.type)?.pins ?? [];
}

/** Initial props for a new node: every field that declares a default. */
export function defaultProps(type: CatalogType): Props {
  const props: Props = {};
  for (const f of type.fields) if (f.default !== undefined) props[f.key] = f.default;
  return props;
}

export { PRESETS, nodeFromPreset, presetOf, type Preset } from './presets';
export { pinSupports, suggestPinMap } from './pins';
export { chooseProtocol, connectNodes } from './connect';
