import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { createEmptyDoc, type ArchDoc } from '../schema';
import { seraIot } from '../templates';
import { bomFiles, wokwiFiles } from './hardware';

const catalog = effectiveCatalog();
const file = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path)!.content;
const diagram = (doc: ArchDoc) => JSON.parse(file(wokwiFiles(doc, catalog), 'wokwi/diagram.json'));

describe('Wokwi export', () => {
  it('places the parts Wokwi has and wires them along the pin maps', () => {
    const d = diagram(seraIot());
    expect(d.parts).toEqual([
      { type: 'board-esp32-s3-devkitc-1', id: 'esp32', top: 120, left: 300, attrs: {} },
      { type: 'board-ssd1306', id: 'oled', top: 180, left: 680, attrs: {} },
      { type: 'wokwi-servo', id: 'vent', top: 340, left: 680, attrs: {} },
    ]);
    expect(d.connections).toEqual([
      ['esp32:TX', '$serialMonitor:RX', '', []],
      ['esp32:RX', '$serialMonitor:TX', '', []],
      ['esp32:8', 'oled:SDA', 'blue', []],
      ['esp32:9', 'oled:SCL', 'gold', []],
      ['esp32:4', 'vent:PWM', 'green', []],
      ['esp32:3V3.1', 'oled:VCC', 'red', []],
      ['esp32:GND.1', 'oled:GND', 'black', []],
    ]);
  });

  it('names the parts it leaves out and the links it cannot wire', () => {
    const doc = seraIot();
    doc.edges.push({ id: 'e-led', source: 'esp32', target: 'vent', protocol: 'GPIO', props: {} });
    const readme = file(wokwiFiles(doc, catalog), 'wokwi/README.md');
    expect(readme).toContain('- BME280 (`bme280`)');
    expect(readme).toContain('- USB 5 V besleme (`usb`)');
    expect(readme).toContain('ESP32-S3 → Havalandırma servosu (GPIO, `e-led`)');
  });

  it('recognizes parts made before nodes recorded their preset', () => {
    const doc = seraIot();
    for (const n of doc.nodes) delete n.preset;
    expect(diagram(doc).parts.map((p: { id: string }) => p.id)).toContain('esp32');
  });

  it('writes nothing for a design without simulatable parts', () => {
    expect(wokwiFiles(createEmptyDoc('Boş'), catalog)).toEqual([]);
  });
});

describe('bill of materials', () => {
  it('groups parts, counts them and totals the prices', () => {
    const doc = seraIot();
    const bme = doc.nodes.find((n) => n.id === 'bme280')!;
    doc.nodes.push({ ...bme, id: 'bme2', label: 'Dış sensör' });
    const csv = file(bomFiles(doc, catalog), 'bom.csv').trimEnd().split('\n');
    expect(csv).toEqual([
      'Part,Type,Quantity,Unit price (USD),Line total (USD),Used as',
      'BME280,sensor,2,6,12,Dış sensör; BME280',
      'ESP32-S3,mcu,1,15,15,ESP32-S3',
      'SG90 servo,actuator,1,2,2,Havalandırma servosu',
      'SSD1306 OLED,actuator,1,4,4,SSD1306 OLED',
      'USB 5 V besleme,power,1,3,3,USB 5 V besleme',
      'Total,,6,,36,',
    ]);
  });

  it('keeps a label from running as a spreadsheet formula and flags missing prices', () => {
    const doc = createEmptyDoc('Kart');
    doc.nodes.push({ id: 'x', domain: 'hardware', type: 'sensor', label: '=cmd()', props: {} });
    const csv = file(bomFiles(doc, catalog), 'bom.csv');
    expect(csv).toContain(`'=cmd(),sensor,1,,,'=cmd()`);
    expect(csv).toContain('Total,,1,,0,1 part(s) without a price');
  });
});
