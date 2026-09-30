import type { PinRole, Protocol } from '../schema';

export interface ProtocolInfo {
  /** Pin roles an edge of this protocol must map (empty for network protocols). */
  roles: PinRole[];
  /** Roles several edges may share on one master pin (bus lines, power rails). */
  sharedRoles: PinRole[];
  /** Edges sharing master pins of this protocol form a derived bus. */
  bus: boolean;
  wireless: boolean;
  /**
   * Nominal link bandwidth used by the load simulation when the edge sets no
   * `bandwidthKbps` prop. Undefined means network-bound (no default limit).
   * Real links deliver less than nominal; override per edge to calibrate.
   */
  defaultKbps?: number;
}

const net = { roles: [], sharedRoles: [], bus: false, wireless: false } satisfies ProtocolInfo;

export const PROTOCOLS: Record<Protocol, ProtocolInfo> = {
  HTTP: net,
  gRPC: net,
  WebSocket: net,
  MQTT: net,
  SQL: net,
  AMQP: net,
  TCP: net,
  // Fast-mode I2C.
  I2C: {
    roles: ['SDA', 'SCL'],
    sharedRoles: ['SDA', 'SCL'],
    bus: true,
    wireless: false,
    defaultKbps: 400,
  },
  // CS selects the device, so it is the one SPI line that cannot be shared.
  SPI: {
    roles: ['MOSI', 'MISO', 'SCK', 'CS'],
    sharedRoles: ['MOSI', 'MISO', 'SCK'],
    bus: true,
    wireless: false,
    defaultKbps: 10_000,
  },
  // 115200 baud.
  UART: { roles: ['TX', 'RX'], sharedRoles: [], bus: false, wireless: false, defaultKbps: 115.2 },
  CAN: {
    roles: ['CANH', 'CANL'],
    sharedRoles: ['CANH', 'CANL'],
    bus: true,
    wireless: false,
    defaultKbps: 500,
  },
  GPIO: { roles: ['GPIO'], sharedRoles: [], bus: false, wireless: false },
  PWM: { roles: ['PWM'], sharedRoles: [], bus: false, wireless: false },
  // USB 2.0 full speed.
  USB: { roles: [], sharedRoles: [], bus: false, wireless: false, defaultKbps: 12_000 },
  // Practical BLE 1M PHY application throughput, well under the 1 Mbit/s air rate.
  BLE: { roles: [], sharedRoles: [], bus: false, wireless: true, defaultKbps: 125 },
  // SF7 / 125 kHz.
  LoRa: { roles: [], sharedRoles: [], bus: false, wireless: true, defaultKbps: 5.47 },
  Power: { roles: ['VCC', 'GND'], sharedRoles: ['VCC', 'GND'], bus: false, wireless: false },
};
