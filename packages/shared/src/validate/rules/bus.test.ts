import { describe, expect, it } from 'vitest';
import { effectiveCatalog, nodeFromPreset, PRESETS } from '../../catalog';
import type { ArchEdge } from '../../schema';
import { seraIot } from '../../templates';
import { validate } from '../index';
import { i2cBuses, normalizeI2cAddress } from './bus';

const catalog = effectiveCatalog();
const part = (id: string, preset: string) =>
  nodeFromPreset(
    PRESETS.find((p) => p.id === preset)!,
    catalog,
    id,
  );
const issues = (doc: ReturnType<typeof seraIot>, rule: string) =>
  validate(doc, catalog).filter((i) => i.rule === rule);
const spi = (id: string, target: string, cs: string, targetCs = 'NSS'): ArchEdge => ({
  id,
  source: 'esp32',
  target,
  protocol: 'SPI',
  pins: [
    { role: 'MOSI', sourcePin: 'GPIO11', targetPin: 'MOSI' },
    { role: 'MISO', sourcePin: 'GPIO13', targetPin: 'MISO' },
    { role: 'SCK', sourcePin: 'GPIO12', targetPin: 'SCK' },
    { role: 'CS', sourcePin: cs, targetPin: targetCs },
  ],
  props: {},
});

describe('bus rules', () => {
  it('pass the Sera IoT design, where two I2C devices share GPIO8/9', () => {
    expect(validate(seraIot(), catalog)).toEqual([]);
    expect(i2cBuses(seraIot())).toEqual([
      {
        master: 'esp32',
        sda: 'GPIO8',
        devices: [
          { nodeId: 'bme280', edgeId: 'e-bme' },
          { nodeId: 'oled', edgeId: 'e-oled' },
        ],
      },
    ]);
  });

  it('flag an SPI link without a chip select', () => {
    const doc = seraIot();
    doc.nodes.push(part('lora', 'sx1276'));
    const edge = spi('e-lora', 'lora', 'GPIO10');
    edge.pins = edge.pins!.filter((m) => m.role !== 'CS');
    doc.edges.push(edge);
    expect(issues(doc, 'missing-pin-roles')[0]!.params.missing).toBe('CS');
  });

  it('flag a pin that cannot perform its role', () => {
    const doc = seraIot();
    doc.nodes.push(part('pi', 'rpi-5'), part('imu', 'mpu6050'));
    doc.edges.push({
      id: 'e-imu',
      source: 'pi',
      target: 'imu',
      protocol: 'I2C',
      // GPIO4 on a Pi is plain GPIO; GPIO3 really is SCL.
      pins: [
        { role: 'SDA', sourcePin: 'GPIO4', targetPin: 'SDA' },
        { role: 'SCL', sourcePin: 'GPIO3', targetPin: 'SCL' },
      ],
      props: {},
    });
    expect(issues(doc, 'pin-role-unsupported').map((i) => i.params.pin)).toEqual(['GPIO4']);
  });

  it('allow shared SPI data lines but not a shared chip select', () => {
    const doc = seraIot();
    doc.nodes.push(part('lora1', 'sx1276'), part('lora2', 'sx1276'));
    doc.edges.push(spi('s1', 'lora1', 'GPIO10'), spi('s2', 'lora2', 'GPIO15'));
    expect(issues(doc, 'pin-conflict')).toEqual([]);

    doc.edges[doc.edges.length - 1] = spi('s2', 'lora2', 'GPIO10');
    const [conflict, ...rest] = issues(doc, 'pin-conflict');
    expect(rest).toEqual([]);
    expect(conflict).toMatchObject({
      severity: 'error',
      params: { pin: 'GPIO10', uses: 'SPI CS' },
    });
  });

  it('flag an I2C line reused as a plain GPIO', () => {
    const doc = seraIot();
    doc.edges.find((e) => e.id === 'e-vent')!.pins![0]!.sourcePin = 'GPIO8';
    expect(issues(doc, 'pin-conflict')[0]!.params).toMatchObject({
      pin: 'GPIO8',
      uses: 'I2C SDA, PWM PWM',
    });
  });

  it('flag two devices at one address on the same bus, not on separate buses', () => {
    const doc = seraIot();
    doc.nodes.push(part('bme2', 'bme280'));
    const edge: ArchEdge = {
      id: 'e-bme2',
      source: 'esp32',
      target: 'bme2',
      protocol: 'I2C',
      pins: [
        { role: 'SDA', sourcePin: 'GPIO8', targetPin: 'SDA' },
        { role: 'SCL', sourcePin: 'GPIO9', targetPin: 'SCL' },
      ],
      props: {},
    };
    doc.edges.push(edge);
    const [conflict] = issues(doc, 'i2c-address-conflict');
    expect(conflict).toMatchObject({
      nodeIds: ['esp32', 'bme280', 'bme2'],
      params: { address: '0x76' },
    });

    // Strap the second sensor to 0x77 (SDO high): no conflict.
    doc.nodes.find((n) => n.id === 'bme2')!.props.i2cAddress = '0x77';
    expect(issues(doc, 'i2c-address-conflict')).toEqual([]);

    // Same address, but on its own bus (GPIO5/6): no conflict either.
    doc.nodes.find((n) => n.id === 'bme2')!.props.i2cAddress = '0x76';
    edge.pins = [
      { role: 'SDA', sourcePin: 'GPIO5', targetPin: 'SDA' },
      { role: 'SCL', sourcePin: 'GPIO6', targetPin: 'SCL' },
    ];
    expect(issues(doc, 'i2c-address-conflict')).toEqual([]);
  });
});

describe('normalizeI2cAddress', () => {
  it('reads hex and decimal, and rejects anything outside 7 bits', () => {
    expect(['0x3C', '0X3c', '60', ' 0x3c '].map(normalizeI2cAddress)).toEqual(
      Array(4).fill('0x3c'),
    );
    expect(['', 'abc', '0x80', '-1', undefined].map(normalizeI2cAddress)).toEqual(
      Array(5).fill(undefined),
    );
  });
});
