import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { pinSupports, suggestPinMap } from './pins';

const pinsOfPreset = (id: string) => PRESETS.find((p) => p.id === id)!.pins!;

describe('pinSupports', () => {
  it('accepts bare roles and peripheral-prefixed functions', () => {
    const pin = { name: 'GPIO2', voltage: 3.3, functions: ['GPIO', 'I2C1_SDA'] };
    expect(pinSupports(pin, 'SDA')).toBe(true);
    expect(pinSupports(pin, 'GPIO')).toBe(true);
    expect(pinSupports(pin, 'SCL')).toBe(false);
  });
});

describe('suggestPinMap', () => {
  it('maps I2C between a Raspberry Pi and a BME280 by pin function', () => {
    expect(suggestPinMap('I2C', pinsOfPreset('rpi-5'), pinsOfPreset('bme280'))).toEqual([
      { role: 'SDA', sourcePin: 'GPIO2', targetPin: 'SDA' },
      { role: 'SCL', sourcePin: 'GPIO3', targetPin: 'SCL' },
    ]);
  });

  it('never reuses a pin within one mapping', () => {
    const map = suggestPinMap('SPI', pinsOfPreset('esp32-s3-devkitc-1'), pinsOfPreset('sx1276'));
    expect(map.map((m) => m.role)).toEqual(['MOSI', 'MISO', 'SCK', 'CS']);
    expect(new Set(map.map((m) => m.sourcePin)).size).toBe(4);
  });

  it('lands a supply rail on the matching voltage', () => {
    const map = suggestPinMap('Power', pinsOfPreset('usb-5v'), pinsOfPreset('esp32-s3-devkitc-1'));
    expect(map).toEqual([
      { role: 'VCC', sourcePin: 'VBUS', targetPin: '5V' },
      { role: 'GND', sourcePin: 'GND', targetPin: 'GND' },
    ]);
  });

  it('leaves out roles a side cannot serve and is empty for network protocols', () => {
    // An SG90 has no SDA/SCL.
    expect(suggestPinMap('I2C', pinsOfPreset('esp32-s3-devkitc-1'), pinsOfPreset('sg90'))).toEqual(
      [],
    );
    expect(suggestPinMap('MQTT', pinsOfPreset('rpi-5'), [])).toEqual([]);
  });
});
