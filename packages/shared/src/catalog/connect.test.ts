import { describe, expect, it } from 'vitest';
import { seraIot } from '../templates';
import { chooseProtocol, connectNodes } from './connect';
import { effectiveCatalog } from './index';

const doc = seraIot();
const catalog = effectiveCatalog();
const node = (id: string) => doc.nodes.find((n) => n.id === id)!;

describe('chooseProtocol', () => {
  it('picks the first protocol both ends speak, in source order', () => {
    expect(chooseProtocol(node('esp32'), node('bme280'), catalog)).toBe('I2C');
    expect(chooseProtocol(node('api'), node('db'), catalog)).toBe('SQL');
    expect(chooseProtocol(node('dashboard'), node('api'), catalog)).toBe('HTTP');
    expect(chooseProtocol(node('esp32'), node('mqtt'), catalog)).toBe('MQTT');
  });

  it('honours a preferred protocol, e.g. from the pad the drag started on', () => {
    expect(chooseProtocol(node('esp32'), node('bme280'), catalog, 'SPI')).toBe('SPI');
  });

  it('falls back to the source protocol when nothing is shared', () => {
    expect(chooseProtocol(node('usb'), node('dashboard'), catalog)).toBe('Power');
  });
});

describe('connectNodes', () => {
  it('suggests pins for wired buses', () => {
    const e = connectNodes(node('esp32'), node('bme280'), catalog);
    expect(e).toMatchObject({ source: 'esp32', target: 'bme280', protocol: 'I2C' });
    expect(e.pins?.map((m) => m.role)).toEqual(['SDA', 'SCL']);
  });

  it('leaves pins off network links', () => {
    expect(connectNodes(node('api'), node('db'), catalog).pins).toBeUndefined();
  });
});
