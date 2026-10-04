import { nodeFromPreset, PRESETS, type Catalog } from '../catalog';
import {
  PinRoleSchema,
  type ArchEdge,
  type ArchNode,
  type PinMap,
  type PinRole,
  type Props,
  type Protocol,
} from '../schema';
import { catalogNode, ImportError, type Imported, type ImportNote } from './common';

/** Parts with no preset, typed by their Wokwi type; the first match wins. */
const GUESS: [RegExp, string, Props?][] = [
  [/esp32/, 'mcu', { family: 'ESP32' }],
  [/nucleo|stm32/, 'mcu', { family: 'STM32' }],
  [/pi-pico|rp2040/, 'mcu', { family: 'RP2040' }],
  [/arduino|attiny/, 'mcu', { family: 'AVR' }],
  [/servo/, 'actuator', { kind: 'Servo' }],
  [/stepper/, 'actuator', { kind: 'Step motor' }],
  [/relay/, 'actuator', { kind: 'Röle' }],
  [/buzzer/, 'actuator', { kind: 'Buzzer' }],
  [/lcd|ssd1306|ili9341|7segment|display|matrix|epaper/, 'actuator', { kind: 'Ekran' }],
  [/led|neopixel/, 'actuator', { kind: 'LED' }],
  [
    /sensor|dht|ds18b20|bmp|mpu|hc-sr04|pir|ntc|photoresistor|potentiometer|button|keypad|hx711|joystick|rfid|mfrc|rtc|ds1307|encoder/,
    'sensor',
  ],
];
/** Breadboard furniture, not parts of the design. */
const FURNITURE = /^wokwi-(breadboard|resistor|capacitor|logic-analyzer|text|junction)/;
const POWER_PIN = /^(VCC|VIN|VDD|V\+|3V3|5V|VBUS|VSYS|\+)/i;
/** Controllers and supplies drive the link; whatever they wire to is the target. */
const RANK: Record<string, number> = { mcu: 0, sbc: 0, power: 1 };

type End = { part: string; pin: string };
const endOf = (s: unknown): End | undefined => {
  if (typeof s !== 'string') return undefined;
  const i = s.indexOf(':');
  return i > 0 ? { part: s.slice(0, i), pin: s.slice(i + 1) } : undefined;
};

/** "dht22" → "DHT22", "pushbutton" → "Pushbutton". */
const prettyType = (t: string) =>
  t
    .replace(/^(wokwi|board)-/, '')
    .split('-')
    .map((w) =>
      /\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1),
    )
    .join(' ');

/** The signal a wire carries, read from its target pin (sensors name theirs). */
function roleOf(target: ArchNode, sourcePin: string, targetPin: string): PinRole {
  if (/^GND/i.test(targetPin) || /^GND/i.test(sourcePin)) return 'GND';
  if (POWER_PIN.test(targetPin)) return 'VCC';
  const declared = target.pins
    ?.find((p) => p.name === targetPin)
    ?.functions.map((f) => f.split('_').at(-1)!)
    .find((r) => r !== 'GPIO');
  const named = declared ?? targetPin.toUpperCase();
  return PinRoleSchema.options.find((r) => r === named) ?? 'GPIO';
}

function protocolOf(roles: Set<PinRole>): Protocol {
  const has = (...r: PinRole[]) => r.some((x) => roles.has(x));
  if (has('SDA', 'SCL')) return 'I2C';
  if (has('MOSI', 'MISO', 'SCK', 'CS')) return 'SPI';
  if (has('TX', 'RX')) return 'UART';
  if (has('CANH', 'CANL')) return 'CAN';
  if (has('PWM')) return 'PWM';
  return 'GPIO';
}

/**
 * A Wokwi diagram.json as hardware parts: known parts become their preset
 * (pins and all), others a part typed by their Wokwi type, placed where
 * Wokwi had them. Wires become links per pair of parts, supply wires on a
 * power link of their own, each wire a pin of the link's pin map. A series
 * resistor between two parts counts as a direct wire; breadboards and other
 * furniture are left out and listed in the notes.
 */
export function fromWokwi(text: string, catalog: Catalog): Imported {
  let src: unknown;
  try {
    src = JSON.parse(text);
  } catch (e) {
    throw new ImportError('syntax', (e as Error).message);
  }
  const parts = (src as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(parts)) throw new ImportError('format');
  const valid = parts.filter(
    (p): p is { id: string; type: string; left?: unknown; top?: unknown } =>
      typeof p?.id === 'string' && typeof p?.type === 'string',
  );
  if (!valid.length) throw new ImportError('empty');

  const notes: ImportNote[] = [];
  const nodes = new Map<string, ArchNode>();
  const toOurs = new Map<string, Record<string, string>>();
  const positions: Record<string, { x: number; y: number }> = {};
  for (const p of valid) {
    if (FURNITURE.test(p.type)) {
      notes.push({ code: 'skipped', subject: `${p.id} (${p.type})` });
      continue;
    }
    const preset = PRESETS.find((x) => x.wokwi?.type === p.type);
    let node: ArchNode;
    if (preset) {
      node = nodeFromPreset(preset, catalog, p.id);
      toOurs.set(
        p.id,
        Object.fromEntries(Object.entries(preset.wokwi!.pins ?? {}).map(([o, w]) => [w, o])),
      );
    } else {
      const guess = GUESS.find(([re]) => re.test(p.type));
      if (!guess) notes.push({ code: 'guessed', subject: `${p.id} (${p.type})` });
      const [, type, props] = guess ?? [/./, 'sensor'];
      node = catalogNode(catalog, p.id, type, prettyType(p.type), props);
    }
    nodes.set(p.id, node);
    positions[p.id] = { x: Number(p.left) || 0, y: Number(p.top) || 0 };
  }

  const connections = (src as { connections?: unknown }).connections;
  const wires: [End, End][] = [];
  for (const c of Array.isArray(connections) ? connections : []) {
    const a = endOf(Array.isArray(c) ? c[0] : undefined);
    const b = endOf(Array.isArray(c) ? c[1] : undefined);
    if (a && b) wires.push([a, b]);
  }
  // Through a resistor: one part on each leg makes a wire between them.
  for (const r of valid.filter((p) => p.type === 'wokwi-resistor')) {
    const legs = ['1', '2'].map((pin) =>
      wires.flatMap(([a, b]) =>
        a.part === r.id && a.pin === pin ? [b] : b.part === r.id && b.pin === pin ? [a] : [],
      ),
    );
    if (legs[0]!.length === 1 && legs[1]!.length === 1) wires.push([legs[0]![0]!, legs[1]![0]!]);
  }

  const links = new Map<string, { source: string; target: string; pins: PinMap[] }>();
  for (const [x, y] of wires) {
    if (!nodes.has(x.part) || !nodes.has(y.part) || x.part === y.part) continue;
    const [s, t] =
      (RANK[nodes.get(y.part)!.type] ?? 2) < (RANK[nodes.get(x.part)!.type] ?? 2) ? [y, x] : [x, y];
    const ours = (e: End) => toOurs.get(e.part)?.[e.pin] ?? e.pin;
    const role = roleOf(nodes.get(t.part)!, ours(s), ours(t));
    const power = role === 'VCC' || role === 'GND';
    const key = `${s.part}-${t.part}${power ? '-power' : ''}`;
    const link = links.get(key) ?? { source: s.part, target: t.part, pins: [] };
    link.pins.push({ role, sourcePin: ours(s), targetPin: ours(t) });
    links.set(key, link);
  }

  const edges: ArchEdge[] = [...links].map(([id, l]) => ({
    id,
    ...l,
    protocol: id.endsWith('-power') ? 'Power' : protocolOf(new Set(l.pins.map((p) => p.role))),
    props: {},
  }));
  return { nodes: [...nodes.values()], edges, positions: { hardware: positions }, notes };
}
