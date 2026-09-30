import type { PinDef, PinMap, PinRole, Protocol } from '../schema';
import { PROTOCOLS } from './protocols';

/** A pin supports a role when a function is the bare role or ends with `_<ROLE>` (I2C1_SDA). */
export function pinSupports(pin: PinDef, role: PinRole): boolean {
  return pin.functions.some((f) => f === role || f.endsWith(`_${role}`));
}

/**
 * Proposes a complete pin mapping for a protocol between two parts: for each
 * required role, the first pin on each side that supports it and is not
 * already taken by this mapping. Supply rails prefer a target pin at the same
 * voltage (USB VBUS lands on 5V, not 3V3). Roles one side cannot serve are
 * left out, so the caller (and the validation rules) can see what is missing.
 */
export function suggestPinMap(protocol: Protocol, source: PinDef[], target: PinDef[]): PinMap[] {
  const usedSource = new Set<string>();
  const usedTarget = new Set<string>();
  const map: PinMap[] = [];

  for (const role of PROTOCOLS[protocol].roles) {
    const src = source.find((p) => pinSupports(p, role) && !usedSource.has(p.name));
    if (!src) continue;
    const candidates = target.filter((p) => pinSupports(p, role) && !usedTarget.has(p.name));
    const tgt =
      (role === 'VCC' && candidates.find((p) => p.voltage === src.voltage)) || candidates[0];
    if (!tgt) continue;
    usedSource.add(src.name);
    usedTarget.add(tgt.name);
    map.push({ role, sourcePin: src.name, targetPin: tgt.name });
  }
  return map;
}
