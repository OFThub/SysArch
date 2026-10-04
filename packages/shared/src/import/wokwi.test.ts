import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { wokwiFiles } from '../export/hardware';
import { seraIot } from '../templates';
import { fromWokwi } from './wokwi';

const catalog = effectiveCatalog();

describe('Wokwi import', () => {
  it('reads back our own export: presets, placement and pin maps', () => {
    const template = seraIot();
    const diagram = wokwiFiles(template, catalog).find((f) => f.path === 'wokwi/diagram.json')!;
    const r = fromWokwi(diagram.content, catalog);

    expect(r.nodes.map((n) => [n.id, n.preset])).toEqual([
      ['esp32', 'esp32-s3-devkitc-1'],
      ['oled', 'ssd1306'],
      ['vent', 'sg90'],
    ]);
    expect(r.positions?.hardware?.esp32).toEqual({ x: 300, y: 120 });
    // The same wiring the template draws, under Wokwi's pin names and back.
    const pins = (id: string) => template.edges.find((e) => e.id === id)!.pins;
    expect(r.edges).toEqual([
      {
        id: 'esp32-oled',
        source: 'esp32',
        target: 'oled',
        pins: pins('e-oled'),
        protocol: 'I2C',
        props: {},
      },
      {
        id: 'esp32-vent',
        source: 'esp32',
        target: 'vent',
        pins: pins('e-vent'),
        protocol: 'PWM',
        props: {},
      },
      {
        id: 'esp32-oled-power',
        source: 'esp32',
        target: 'oled',
        pins: pins('p-oled'),
        protocol: 'Power',
        props: {},
      },
    ]);
    expect(r.notes).toEqual([]);
  });

  it('wires an LED through its series resistor and notes what it leaves out', () => {
    const r = fromWokwi(
      JSON.stringify({
        version: 1,
        parts: [
          { type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0 },
          { type: 'wokwi-led', id: 'led1', top: -80, left: 120 },
          { type: 'wokwi-resistor', id: 'r1', top: -20, left: 90 },
          { type: 'wokwi-breadboard-half', id: 'bb1', top: 200, left: 0 },
          { type: 'chip-custom', id: 'c1', top: 0, left: 300 },
        ],
        connections: [
          ['led1:A', 'r1:2', 'green', []],
          ['r1:1', 'uno:13', 'green', []],
          ['led1:C', 'uno:GND.1', 'black', []],
        ],
      }),
      catalog,
    );
    expect(r.nodes.map((n) => `${n.id} ${n.type} ${n.label}`)).toEqual([
      'uno mcu Arduino UNO',
      'led1 actuator LED',
      'c1 sensor Chip Custom',
    ]);
    expect(r.edges).toEqual([
      {
        id: 'uno-led1-power',
        source: 'uno',
        target: 'led1',
        pins: [{ role: 'GND', sourcePin: 'GND.1', targetPin: 'C' }],
        protocol: 'Power',
        props: {},
      },
      {
        id: 'uno-led1',
        source: 'uno',
        target: 'led1',
        pins: [{ role: 'GPIO', sourcePin: '13', targetPin: 'A' }],
        protocol: 'GPIO',
        props: {},
      },
    ]);
    expect(r.notes).toEqual([
      { code: 'skipped', subject: 'r1 (wokwi-resistor)' },
      { code: 'skipped', subject: 'bb1 (wokwi-breadboard-half)' },
      { code: 'guessed', subject: 'c1 (chip-custom)' },
    ]);
  });

  it('rejects text that is not a diagram', () => {
    expect(() => fromWokwi('{', catalog)).toThrow(expect.objectContaining({ code: 'syntax' }));
    expect(() => fromWokwi('{"parts": 1}', catalog)).toThrow(
      expect.objectContaining({ code: 'format' }),
    );
  });
});
