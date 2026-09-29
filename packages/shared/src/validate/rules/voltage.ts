import { pinsOf } from '../../catalog';
import type { ArchNode, PinDef } from '../../schema';
import type { Finding, Rule, RuleContext } from '../types';

/**
 * How far apart two pin voltages may be before it counts as a mismatch.
 * Datasheet levels are nominal: a "3.3 V" rail measures 3.2–3.4 V, and many
 * 3.3 V parts accept 3.6 V. Tune this rather than editing presets.
 */
export const VOLTAGE_TOLERANCE_V = 0.3;

/** The named pin on a node, if the node (or its type) lists it. */
export const pinOn = (node: ArchNode, name: string, ctx: RuleContext): PinDef | undefined =>
  pinsOf(node, ctx.catalog).find((p) => p.name === name);

/**
 * Every pin mapping whose two ends sit at different voltages, e.g. an
 * HC-SR04's 5 V ECHO wired to an ESP32's 3.3 V GPIO.
 *
 * Each finding: nodeIds [source, target], edgeIds [edge], and params
 * { source, target, sourcePin, targetPin, sourceV, targetV, role }
 * (labels, pin names, voltages) for the messages below.
 */
export function voltageMismatches(ctx: RuleContext, toleranceV: number): Finding[] {
  return ctx.doc.edges.flatMap((e) => {
    const src = ctx.node(e.source);
    const tgt = ctx.node(e.target);
    if (!src || !tgt) return [];
    return (e.pins ?? []).flatMap((m): Finding[] => {
      const a = pinOn(src, m.sourcePin, ctx);
      const b = pinOn(tgt, m.targetPin, ctx);
      if (!a || !b || Math.abs(a.voltage - b.voltage) <= toleranceV) return [];
      return [
        {
          // A wrong supply rail always over- or under-powers the part. On a
          // signal line the risk depends on which side drives it, which the
          // edge direction does not tell (ECHO flows sensor → MCU on an
          // MCU → sensor edge), so it is flagged for review instead.
          severity: m.role === 'VCC' ? 'error' : 'warning',
          nodeIds: [src.id, tgt.id],
          edgeIds: [e.id],
          key: m.role,
          params: {
            source: src.label,
            target: tgt.label,
            sourcePin: m.sourcePin,
            targetPin: m.targetPin,
            sourceV: a.voltage,
            targetV: b.voltage,
            role: m.role,
          },
        },
      ];
    });
  });
}

export const pinVoltage: Rule = {
  id: 'pin-voltage',
  category: 'compat',
  check: (ctx) => voltageMismatches(ctx, VOLTAGE_TOLERANCE_V),
  text: {
    tr: (p) => ({
      message: `“${p.source}” ${p.sourcePin} (${p.sourceV} V) ile “${p.target}” ${p.targetPin} (${p.targetV} V) arasında gerilim uyuşmazlığı.`,
      hint: 'Seviye dönüştürücü ya da gerilim bölücü ekle, veya aynı seviyede bir pin seç.',
    }),
    en: (p) => ({
      message: `Voltage mismatch between “${p.source}” ${p.sourcePin} (${p.sourceV} V) and “${p.target}” ${p.targetPin} (${p.targetV} V).`,
      hint: 'Add a level shifter or divider, or pick a pin at the same level.',
    }),
  },
};
