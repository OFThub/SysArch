import { newId } from '../id';
import type { ArchEdge, ArchNode, Protocol } from '../schema';
import { pinsOf, type Catalog } from './index';
import { PROTOCOLS } from './protocols';
import { suggestPinMap } from './pins';

/**
 * The protocol a new link between two nodes should start with: the caller's
 * preference if both ends speak it, else the first protocol in the source
 * type's list that the target also speaks (catalog order puts the most
 * natural one first: I2C for an MCU, HTTP for an API). With no common
 * protocol the source's first one is used and the validation rules flag it.
 */
export function chooseProtocol(
  source: ArchNode,
  target: ArchNode,
  catalog: Catalog,
  preferred?: Protocol,
): Protocol {
  const from = catalog.get(source.type)?.protocols ?? [];
  const to = new Set(catalog.get(target.type)?.protocols ?? []);
  if (preferred && (from.includes(preferred) || to.has(preferred))) return preferred;
  return from.find((p) => to.has(p)) ?? from[0] ?? 'HTTP';
}

/** A ready edge between two nodes: protocol chosen, pins suggested for wired buses. */
export function connectNodes(
  source: ArchNode,
  target: ArchNode,
  catalog: Catalog,
  preferred?: Protocol,
): ArchEdge {
  const protocol = chooseProtocol(source, target, catalog, preferred);
  const pins = PROTOCOLS[protocol].roles.length
    ? suggestPinMap(protocol, pinsOf(source, catalog), pinsOf(target, catalog))
    : [];
  return {
    id: newId(),
    source: source.id,
    target: target.id,
    protocol,
    ...(pins.length > 0 && { pins }),
    props: {},
  };
}
