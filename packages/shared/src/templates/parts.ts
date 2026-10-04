import { defaultProps, effectiveCatalog, nodeFromPreset, PRESETS } from '../catalog';
import type { ArchEdge, ArchNode, Props, Protocol } from '../schema';

const catalog = effectiveCatalog();

/** A part from a preset: the real part's values and pins. */
export function part(id: string, presetId: string): ArchNode {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`unknown preset ${presetId}`);
  return nodeFromPreset(preset, catalog, id);
}

/** A component of a catalog type: the type's defaults, then these props. */
export function node(id: string, type: string, label: string, props: Props = {}): ArchNode {
  const t = catalog.get(type);
  if (!t) throw new Error(`unknown type ${type}`);
  return { id, domain: t.domain, type, label, props: { ...defaultProps(t), ...props } };
}

/** A link with nothing to say beyond its protocol. */
export const link = (id: string, source: string, target: string, protocol: Protocol): ArchEdge => ({
  id,
  source,
  target,
  protocol,
  props: {},
});

export const at = (x: number, y: number) => ({ x, y });
