import { pinsOf, pinSupports, PROTOCOLS } from '../../catalog';
import type { ArchDoc, ArchEdge, ArchNode, PinRole } from '../../schema';
import type { Finding, Rule } from '../types';
import { pinOn } from './voltage';

/** A protocol edge whose pin map leaves required lines unwired (SPI without CS). */
export const missingPinRoles: Rule = {
  id: 'missing-pin-roles',
  category: 'compat',
  check: (ctx) =>
    ctx.doc.edges.flatMap((e): Finding[] => {
      const roles = PROTOCOLS[e.protocol].roles;
      const src = ctx.node(e.source);
      const tgt = ctx.node(e.target);
      if (!roles.length || !src || !tgt) return [];
      // Abstract designs (parts without pin lists, nothing mapped yet) are left alone.
      const detailed =
        (e.pins?.length ?? 0) > 0 ||
        (pinsOf(src, ctx.catalog).length > 0 && pinsOf(tgt, ctx.catalog).length > 0);
      const mapped = new Set((e.pins ?? []).map((m) => m.role));
      const missing = roles.filter((r) => !mapped.has(r));
      if (!detailed || !missing.length) return [];
      return [
        {
          severity: 'warning',
          nodeIds: [src.id, tgt.id],
          edgeIds: [e.id],
          params: {
            source: src.label,
            target: tgt.label,
            protocol: e.protocol,
            missing: missing.join(', '),
          },
        },
      ];
    }),
  text: {
    tr: (p) => ({
      message: `“${p.source}” ile “${p.target}” arasındaki ${p.protocol} bağlantısında eşlenmemiş hat var: ${p.missing}.`,
      hint: 'Özellikler panelinde pin eşlemesini tamamla ya da Pinleri öner düğmesini kullan.',
    }),
    en: (p) => ({
      message: `The ${p.protocol} link between “${p.source}” and “${p.target}” leaves lines unmapped: ${p.missing}.`,
      hint: 'Complete the pin mapping in the property panel, or use Suggest pins.',
    }),
  },
};

/** A mapped pin that cannot do the job its role asks for (a plain GPIO used as SDA). */
export const pinRoleUnsupported: Rule = {
  id: 'pin-role-unsupported',
  category: 'compat',
  check: (ctx) =>
    ctx.doc.edges.flatMap((e) => {
      const ends = { source: ctx.node(e.source), target: ctx.node(e.target) };
      return (e.pins ?? []).flatMap((m) =>
        (['source', 'target'] as const).flatMap((side): Finding[] => {
          const node = ends[side];
          const name = side === 'source' ? m.sourcePin : m.targetPin;
          const pin = node && pinOn(node, name, ctx);
          if (!node || !pin || pinSupports(pin, m.role)) return [];
          return [
            {
              severity: 'warning',
              nodeIds: [node.id],
              edgeIds: [e.id],
              key: `${m.role}:${side}`,
              params: {
                label: node.label,
                pin: name,
                role: m.role,
                functions: pin.functions.join(', ') || '—',
              },
            },
          ];
        }),
      );
    }),
  text: {
    tr: (p) => ({
      message: `“${p.label}” ${p.pin} pini ${p.role} işini yapamıyor.`,
      hint: `Bu pinin işlevleri: ${p.functions}. ${p.role} destekleyen bir pin seç.`,
    }),
    en: (p) => ({
      message: `Pin ${p.pin} on “${p.label}” cannot act as ${p.role}.`,
      hint: `Its functions: ${p.functions}. Pick a pin that supports ${p.role}.`,
    }),
  },
};

interface PinUse {
  edge: ArchEdge;
  role: PinRole;
}

/**
 * One physical pin wired into more than one job. Bus lines may be shared
 * (I2C SDA/SCL, SPI MOSI/MISO/SCK, power rails), but only for the same
 * protocol and role; a chip-select, UART line or plain GPIO may not.
 */
export const pinConflict: Rule = {
  id: 'pin-conflict',
  category: 'compat',
  check: (ctx) => {
    const uses = new Map<string, { node: ArchNode; pin: string; uses: PinUse[] }>();
    const add = (nodeId: string, pin: string, use: PinUse) => {
      const node = ctx.node(nodeId);
      if (!node) return;
      const key = `${nodeId}\u0000${pin}`;
      const entry = uses.get(key) ?? { node, pin, uses: [] };
      entry.uses.push(use);
      uses.set(key, entry);
    };
    for (const e of ctx.doc.edges)
      for (const m of e.pins ?? []) {
        add(e.source, m.sourcePin, { edge: e, role: m.role });
        add(e.target, m.targetPin, { edge: e, role: m.role });
      }

    return [...uses.values()].flatMap(({ node, pin, uses: list }): Finding[] => {
      if (list.length < 2) return [];
      const sameJob = new Set(list.map((u) => `${u.edge.protocol}:${u.role}`)).size === 1;
      const shareable = list.every((u) => PROTOCOLS[u.edge.protocol].sharedRoles.includes(u.role));
      if (sameJob && shareable) return [];
      return [
        {
          severity: 'error',
          nodeIds: [node.id],
          edgeIds: [...new Set(list.map((u) => u.edge.id))],
          key: pin,
          params: {
            label: node.label,
            pin,
            uses: [...new Set(list.map((u) => `${u.edge.protocol} ${u.role}`))].join(', '),
          },
        },
      ];
    });
  },
  text: {
    tr: (p) => ({
      message: `“${p.label}” ${p.pin} pini birden fazla işe bağlanmış: ${p.uses}.`,
      hint: 'Paylaşılamayan hatlar (CS, TX/RX, GPIO) için her cihaza ayrı pin ayır.',
    }),
    en: (p) => ({
      message: `Pin ${p.pin} on “${p.label}” is wired to more than one job: ${p.uses}.`,
      hint: 'Give every device its own pin for lines that cannot be shared (CS, TX/RX, GPIO).',
    }),
  },
};

/** `0x76`, `0X76` and `118` all mean 0x76; anything outside 7-bit I2C is not an address. */
export function normalizeI2cAddress(value: unknown): string | undefined {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  const n = s.startsWith('0x')
    ? Number.parseInt(s.slice(2), 16)
    : /^\d+$/.test(s)
      ? Number(s)
      : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 0x7f
    ? `0x${n.toString(16).padStart(2, '0')}`
    : undefined;
}

export interface I2cBus {
  master: string;
  /** The master's SDA pin; edges sharing it form one bus. */
  sda: string;
  devices: { nodeId: string; edgeId: string }[];
}

/**
 * I2C buses are derived, not drawn: every I2C edge leaving the same master
 * pin (its SDA) is on the same bus. Edges without an SDA mapping are skipped.
 */
export function i2cBuses(doc: ArchDoc): I2cBus[] {
  const buses = new Map<string, I2cBus>();
  for (const e of doc.edges) {
    const sda = e.protocol === 'I2C' ? e.pins?.find((m) => m.role === 'SDA') : undefined;
    if (!sda) continue;
    const key = `${e.source}\u0000${sda.sourcePin}`;
    const bus = buses.get(key) ?? { master: e.source, sda: sda.sourcePin, devices: [] };
    bus.devices.push({ nodeId: e.target, edgeId: e.id });
    buses.set(key, bus);
  }
  return [...buses.values()];
}

/** Two devices answering at the same address on one I2C bus. */
export const i2cAddressConflict: Rule = {
  id: 'i2c-address-conflict',
  category: 'compat',
  check: (ctx) =>
    i2cBuses(ctx.doc).flatMap((bus) => {
      const byAddress = new Map<string, { nodeId: string; edgeId: string }[]>();
      for (const d of bus.devices) {
        const address = normalizeI2cAddress(ctx.node(d.nodeId)?.props.i2cAddress);
        if (!address) continue;
        const list = byAddress.get(address) ?? [];
        // The same device linked twice is still one device.
        if (!list.some((x) => x.nodeId === d.nodeId)) list.push(d);
        byAddress.set(address, list);
      }
      return [...byAddress].flatMap(([address, devices]): Finding[] =>
        devices.length < 2
          ? []
          : [
              {
                severity: 'error',
                nodeIds: [bus.master, ...devices.map((d) => d.nodeId)],
                edgeIds: devices.map((d) => d.edgeId),
                key: address,
                params: {
                  master: ctx.node(bus.master)?.label ?? bus.master,
                  pin: bus.sda,
                  address,
                  devices: devices.map((d) => `“${ctx.node(d.nodeId)?.label}”`).join(', '),
                },
              },
            ],
      );
    }),
  text: {
    tr: (p) => ({
      message: `“${p.master}” ${p.pin} I2C hattında ${p.address} adresini birden fazla cihaz kullanıyor: ${p.devices}.`,
      hint: 'Cihazın adres pinini değiştir (BME280 SDO, MPU6050 AD0), ikinci bir I2C hattı ya da TCA9548A gibi bir çoklayıcı kullan.',
    }),
    en: (p) => ({
      message: `Several devices share address ${p.address} on the I2C bus at “${p.master}” ${p.pin}: ${p.devices}.`,
      hint: 'Change a device address pin (BME280 SDO, MPU6050 AD0), use a second I2C bus or a multiplexer such as TCA9548A.',
    }),
  },
};
