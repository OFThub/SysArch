import type { ArchNode, PinDef, Props } from '../schema';
import { defaultProps, type Catalog } from './index';

/**
 * A ready-made part (Fritzing/Wokwi style): a generic catalog type filled with
 * a real part's values. Presets are not types; instantiating one copies its
 * props and pins onto the node so the doc stays self-contained.
 *
 * Pin `functions` use `<PERIPHERAL>[n]_<ROLE>` (I2C1_SDA, SPI0_CS, UART0_TX)
 * or a bare role (GPIO, PWM, VCC, GND). A pin supports a role when a function
 * equals the role or ends with `_<ROLE>`.
 *
 * Values come from datasheets and typical dev-board draws. Real parts drift
 * (regulator dropout, radio bursts), so every number stays editable per node.
 */
export interface Preset {
  id: string;
  type: string;
  label: string;
  props: Props;
  pins?: PinDef[];
  /**
   * The matching Wokwi part: its type, the pin names that differ from ours,
   * and the TX/RX pins that feed Wokwi's serial monitor. Pin names come from
   * Wokwi's part docs and board files; `wokwi-cli lint` checks a diagram.
   */
  wokwi?: { type: string; pins?: Record<string, string>; serial?: [tx: string, rx: string] };
}

const pin = (name: string, voltage: number, ...functions: string[]): PinDef => ({
  name,
  voltage,
  functions,
});
const vcc = (name: string, v: number) => pin(name, v, 'VCC');
const gnd = pin('GND', 0, 'GND');

// ESP32's GPIO matrix routes any peripheral to (almost) any pin.
const ESP32_MATRIX = [
  'GPIO',
  'PWM',
  'I2C_SDA',
  'I2C_SCL',
  'SPI_MOSI',
  'SPI_MISO',
  'SPI_SCK',
  'SPI_CS',
  'UART_TX',
  'UART_RX',
];
const espGpio = (n: number) => pin(`GPIO${n}`, 3.3, ...ESP32_MATRIX);

// Fixed-function header pins shared by the Raspberry Pi 40-pin layout.
const piHeader = (names: (n: number) => string): PinDef[] => [
  pin(names(2), 3.3, 'GPIO', 'I2C1_SDA'),
  pin(names(3), 3.3, 'GPIO', 'I2C1_SCL'),
  pin(names(4), 3.3, 'GPIO'),
  pin(names(7), 3.3, 'GPIO', 'SPI0_CS'),
  pin(names(8), 3.3, 'GPIO', 'SPI0_CS'),
  pin(names(9), 3.3, 'GPIO', 'SPI0_MISO'),
  pin(names(10), 3.3, 'GPIO', 'SPI0_MOSI'),
  pin(names(11), 3.3, 'GPIO', 'SPI0_SCK'),
  pin(names(12), 3.3, 'GPIO', 'PWM'),
  pin(names(13), 3.3, 'GPIO', 'PWM'),
  pin(names(14), 3.3, 'GPIO', 'UART0_TX'),
  pin(names(15), 3.3, 'GPIO', 'UART0_RX'),
  pin(names(17), 3.3, 'GPIO'),
  pin(names(18), 3.3, 'GPIO', 'PWM'),
  pin(names(22), 3.3, 'GPIO'),
  pin(names(27), 3.3, 'GPIO'),
  vcc('3V3', 3.3),
  vcc('5V', 5),
  gnd,
];

export const PRESETS: Preset[] = [
  {
    id: 'esp32-s3-devkitc-1',
    type: 'mcu',
    label: 'ESP32-S3',
    props: { family: 'ESP32', voltage: 3.3, currentMa: 100, clockMhz: 240, priceUsd: 15 },
    pins: [
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 43, 44].map(espGpio),
      vcc('3V3', 3.3),
      vcc('5V', 5),
      gnd,
    ],
    // Wokwi numbers GPIOs bare ("8") and names UART0 (GPIO43/44) TX/RX.
    wokwi: {
      type: 'board-esp32-s3-devkitc-1',
      pins: {
        ...Object.fromEntries(
          [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18].map((n) => [`GPIO${n}`, `${n}`]),
        ),
        GPIO43: 'TX',
        GPIO44: 'RX',
        '3V3': '3V3.1',
        GND: 'GND.1',
      },
      serial: ['TX', 'RX'],
    },
  },
  {
    id: 'rpi-5',
    type: 'sbc',
    label: 'Raspberry Pi 5',
    props: { os: 'Raspberry Pi OS', ramGb: 8, voltage: 5, currentMa: 1200, priceUsd: 80 },
    // Header pins named by BCM GPIO number.
    pins: piHeader((n) => `GPIO${n}`),
  },
  {
    id: 'jetson-orin-nano',
    type: 'sbc',
    label: 'Jetson Orin Nano',
    // Dev kit runs from a 19 V barrel jack; ~15 W typical.
    props: { os: 'JetPack', ramGb: 8, voltage: 19, currentMa: 800, priceUsd: 249 },
    // Pi-compatible 40-pin header; named by physical pin to match NVIDIA docs.
    pins: [
      pin('PIN3', 3.3, 'GPIO', 'I2C1_SDA'),
      pin('PIN5', 3.3, 'GPIO', 'I2C1_SCL'),
      pin('PIN8', 3.3, 'GPIO', 'UART1_TX'),
      pin('PIN10', 3.3, 'GPIO', 'UART1_RX'),
      pin('PIN19', 3.3, 'GPIO', 'SPI0_MOSI'),
      pin('PIN21', 3.3, 'GPIO', 'SPI0_MISO'),
      pin('PIN23', 3.3, 'GPIO', 'SPI0_SCK'),
      pin('PIN24', 3.3, 'GPIO', 'SPI0_CS'),
      pin('PIN26', 3.3, 'GPIO', 'SPI0_CS'),
      pin('PIN32', 3.3, 'GPIO', 'PWM'),
      pin('PIN33', 3.3, 'GPIO', 'PWM'),
      pin('PIN7', 3.3, 'GPIO'),
      pin('PIN11', 3.3, 'GPIO'),
      vcc('3V3', 3.3),
      vcc('5V', 5),
      gnd,
    ],
  },
  {
    id: 'bme280',
    type: 'sensor',
    label: 'BME280',
    props: {
      measures: 'sıcaklık, nem, basınç',
      i2cAddress: '0x76',
      sampleRateHz: 1,
      voltage: 3.3,
      currentMa: 0.004,
      priceUsd: 6,
    },
    pins: [
      vcc('VIN', 3.3),
      gnd,
      pin('SDA', 3.3, 'I2C_SDA', 'SPI_MOSI'),
      pin('SCL', 3.3, 'I2C_SCL', 'SPI_SCK'),
      pin('SDO', 3.3, 'SPI_MISO'),
      pin('CSB', 3.3, 'SPI_CS'),
    ],
  },
  {
    id: 'mpu6050',
    type: 'sensor',
    label: 'MPU6050',
    props: {
      measures: 'ivme, açısal hız',
      i2cAddress: '0x68',
      sampleRateHz: 100,
      voltage: 3.3,
      currentMa: 3.9,
      priceUsd: 3,
    },
    pins: [
      vcc('VCC', 3.3),
      gnd,
      pin('SDA', 3.3, 'I2C_SDA'),
      pin('SCL', 3.3, 'I2C_SCL'),
      pin('INT', 3.3, 'GPIO'),
    ],
    wokwi: { type: 'wokwi-mpu6050' },
  },
  {
    id: 'hc-sr04',
    type: 'sensor',
    label: 'HC-SR04',
    // 5 V part: ECHO drives 5 V into the MCU, the classic level-shift mistake.
    props: { measures: 'mesafe', sampleRateHz: 20, voltage: 5, currentMa: 15, priceUsd: 2 },
    pins: [vcc('VCC', 5), gnd, pin('TRIG', 5, 'GPIO'), pin('ECHO', 5, 'GPIO')],
    wokwi: { type: 'wokwi-hc-sr04' },
  },
  {
    id: 'ssd1306',
    type: 'actuator',
    label: 'SSD1306 OLED',
    props: { kind: 'Ekran', i2cAddress: '0x3C', voltage: 3.3, currentMa: 20, priceUsd: 4 },
    pins: [vcc('VCC', 3.3), gnd, pin('SDA', 3.3, 'I2C_SDA'), pin('SCL', 3.3, 'I2C_SCL')],
    wokwi: { type: 'board-ssd1306' },
  },
  {
    id: 'sg90',
    type: 'actuator',
    label: 'SG90 servo',
    // Moving draw; stall reaches ~650 mA. Signal accepts 3.3 V logic.
    props: { kind: 'Servo', voltage: 5, currentMa: 200, priceUsd: 2 },
    pins: [vcc('VCC', 5), gnd, pin('SIG', 3.3, 'PWM')],
    wokwi: { type: 'wokwi-servo', pins: { VCC: 'V+', SIG: 'PWM' } },
  },
  {
    id: 'li-ion-18650',
    type: 'power',
    label: '18650 Li-ion',
    props: {
      kind: 'Batarya',
      outputVoltage: 3.7,
      maxCurrentMa: 2000,
      capacityMah: 2600,
      priceUsd: 5,
    },
    pins: [vcc('+', 3.7), gnd],
  },
  {
    id: 'usb-5v',
    type: 'power',
    label: 'USB 5 V besleme',
    // USB 2.0 port budget.
    props: {
      kind: 'USB besleme',
      outputVoltage: 5,
      maxCurrentMa: 500,
      capacityMah: 0,
      priceUsd: 3,
    },
    pins: [vcc('VBUS', 5), gnd],
  },
  {
    id: 'ams1117-3v3',
    type: 'power',
    label: 'AMS1117 3.3 V',
    props: {
      kind: 'Regülatör',
      outputVoltage: 3.3,
      maxCurrentMa: 800,
      capacityMah: 0,
      priceUsd: 1,
    },
    pins: [vcc('VIN', 5), vcc('VOUT', 3.3), gnd],
  },
  {
    id: 'sx1276',
    type: 'comm_module',
    label: 'SX1276 LoRa',
    props: { kind: 'LoRa', voltage: 3.3, currentMa: 40, priceUsd: 8 },
    pins: [
      vcc('3V3', 3.3),
      gnd,
      pin('MOSI', 3.3, 'SPI_MOSI'),
      pin('MISO', 3.3, 'SPI_MISO'),
      pin('SCK', 3.3, 'SPI_SCK'),
      pin('NSS', 3.3, 'SPI_CS'),
      pin('DIO0', 3.3, 'GPIO'),
    ],
  },
];

/** The preset a part came from; parts made before nodes recorded it match on type and label. */
export function presetOf(n: ArchNode): Preset | undefined {
  return n.preset !== undefined
    ? PRESETS.find((p) => p.id === n.preset)
    : PRESETS.find((p) => p.type === n.type && p.label === n.label);
}

/** Builds a node from a preset: type defaults, then the part's own values and pins. */
export function nodeFromPreset(preset: Preset, catalog: Catalog, id: string): ArchNode {
  const type = catalog.get(preset.type);
  if (!type) throw new Error(`preset ${preset.id} uses unknown type ${preset.type}`);
  return {
    id,
    domain: type.domain,
    type: type.type,
    preset: preset.id,
    label: preset.label,
    props: { ...defaultProps(type), ...preset.props },
    ...(preset.pins && { pins: preset.pins.map((p) => ({ ...p, functions: [...p.functions] })) }),
  };
}
