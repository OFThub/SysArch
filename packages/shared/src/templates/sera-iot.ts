import { defaultProps, effectiveCatalog, nodeFromPreset, PRESETS } from '../catalog';
import { ArchDocSchema, createEmptyDoc, type ArchDoc, type ArchNode, type Props } from '../schema';

const catalog = effectiveCatalog();

function part(id: string, presetId: string): ArchNode {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`unknown preset ${presetId}`);
  return nodeFromPreset(preset, catalog, id);
}

function node(id: string, type: string, label: string, props: Props = {}): ArchNode {
  const t = catalog.get(type);
  if (!t) throw new Error(`unknown type ${type}`);
  return { id, domain: t.domain, type, label, props: { ...defaultProps(t), ...props } };
}

const telemetry = {
  schemaName: 'Telemetry',
  fields: [
    { name: 'deviceId', type: 'string' },
    { name: 'temperature', type: 'number' },
    { name: 'humidity', type: 'number' },
    { name: 'pressure', type: 'number' },
    { name: 'ts', type: 'string' },
  ],
  sizeBytes: 120,
  ratePerSec: 0.2,
  topic: 'sera/+/telemetry',
};

// ESP32-S3 default I2C pins (Arduino core): SDA GPIO8, SCL GPIO9.
const i2c = (sda: string, scl: string) => [
  { role: 'SDA' as const, sourcePin: 'GPIO8', targetPin: sda },
  { role: 'SCL' as const, sourcePin: 'GPIO9', targetPin: scl },
];
const power = (vccOut: string, vccIn: string) => [
  { role: 'VCC' as const, sourcePin: vccOut, targetPin: vccIn },
  { role: 'GND' as const, sourcePin: 'GND', targetPin: 'GND' },
];

/**
 * Greenhouse monitoring across all three domains: an ESP32 reads climate
 * sensors and drives a vent servo, publishes over MQTT to a backend that
 * stores readings, and an anomaly model trained on history flags problems.
 * Used as the first template, the login backdrop and a test fixture.
 */
export function seraIot(): ArchDoc {
  const doc = createEmptyDoc('Sera IoT');
  doc.meta.description =
    'Greenhouse climate monitoring: ESP32 sensor node, MQTT backend, anomaly detection.';

  const vent = part('vent', 'sg90');
  vent.label = 'Havalandırma servosu';

  doc.nodes = [
    part('esp32', 'esp32-s3-devkitc-1'),
    part('bme280', 'bme280'),
    part('oled', 'ssd1306'),
    vent,
    part('usb', 'usb-5v'),
    node('mqtt', 'queue', 'Mosquitto', { engine: 'Mosquitto' }),
    node('api', 'api', 'Sera API', { port: 3000 }),
    node('db', 'database', 'Ölçüm veritabanı'),
    node('dashboard', 'frontend', 'Panel'),
    node('history', 'dataset', 'Ölçüm geçmişi', { format: 'Parquet', sizeGb: 2 }),
    node('train', 'training', 'Anomali eğitimi', { gpu: 'T4', hoursPerMonth: 4 }),
    node('anomaly', 'model_serving', 'Anomali modeli', {
      framework: 'ONNX Runtime',
      model: 'isolation-forest',
      latencyMs: 30,
    }),
    node('llm', 'llm_api', 'Günlük özet', {
      provider: 'Anthropic',
      model: 'claude-haiku-4-5',
      requestsPerDay: 24,
    }),
  ];

  doc.edges = [
    {
      id: 'e-bme',
      source: 'esp32',
      target: 'bme280',
      protocol: 'I2C',
      pins: i2c('SDA', 'SCL'),
      props: {},
    },
    {
      id: 'e-oled',
      source: 'esp32',
      target: 'oled',
      protocol: 'I2C',
      pins: i2c('SDA', 'SCL'),
      props: {},
    },
    {
      id: 'e-vent',
      source: 'esp32',
      target: 'vent',
      protocol: 'PWM',
      pins: [{ role: 'PWM', sourcePin: 'GPIO4', targetPin: 'SIG' }],
      props: {},
    },
    {
      id: 'p-esp',
      source: 'usb',
      target: 'esp32',
      protocol: 'Power',
      pins: power('VBUS', '5V'),
      props: {},
    },
    {
      id: 'p-vent',
      source: 'usb',
      target: 'vent',
      protocol: 'Power',
      pins: power('VBUS', 'VCC'),
      props: {},
    },
    {
      id: 'p-bme',
      source: 'esp32',
      target: 'bme280',
      protocol: 'Power',
      pins: power('3V3', 'VIN'),
      props: {},
    },
    {
      id: 'p-oled',
      source: 'esp32',
      target: 'oled',
      protocol: 'Power',
      pins: power('3V3', 'VCC'),
      props: {},
    },
    {
      id: 'e-publish',
      source: 'esp32',
      target: 'mqtt',
      protocol: 'MQTT',
      props: { transport: 'wifi', qos: 1 },
      payload: telemetry,
    },
    {
      id: 'e-subscribe',
      source: 'api',
      target: 'mqtt',
      protocol: 'MQTT',
      props: {},
      payload: telemetry,
    },
    { id: 'e-store', source: 'api', target: 'db', protocol: 'SQL', props: {} },
    {
      id: 'e-dashboard',
      source: 'dashboard',
      target: 'api',
      protocol: 'HTTP',
      props: {},
      payload: {
        schemaName: 'Readings',
        fields: [
          { name: 'deviceId', type: 'string' },
          { name: 'series', type: 'Reading[]' },
        ],
        sizeBytes: 4096,
        ratePerSec: 0.5,
      },
    },
    {
      id: 'e-score',
      source: 'api',
      target: 'anomaly',
      protocol: 'HTTP',
      props: {},
      payload: {
        schemaName: 'Features',
        fields: [{ name: 'window', type: 'number[]' }],
        sizeBytes: 256,
        ratePerSec: 0.2,
      },
    },
    { id: 'e-summary', source: 'api', target: 'llm', protocol: 'HTTP', props: {} },
    { id: 'e-export', source: 'db', target: 'history', protocol: 'SQL', props: {} },
    { id: 'e-train', source: 'history', target: 'train', protocol: 'HTTP', props: {} },
    { id: 'e-deploy', source: 'train', target: 'anomaly', protocol: 'HTTP', props: {} },
  ];

  const at = (x: number, y: number) => ({ x, y });
  const view = (id: string) => doc.views.find((v) => v.id === id)!;
  // Cross-domain neighbours appear as proxies in domain tabs, so they get positions too.
  view('hardware').positions = {
    usb: at(0, 260),
    esp32: at(300, 120),
    bme280: at(680, 0),
    oled: at(680, 180),
    vent: at(680, 340),
    mqtt: at(1000, 120),
  };
  view('fullstack').positions = {
    esp32: at(0, 0),
    mqtt: at(300, 0),
    dashboard: at(0, 220),
    api: at(300, 220),
    db: at(640, 120),
    anomaly: at(640, 300),
    llm: at(640, 440),
    history: at(960, 120),
  };
  view('ai').positions = {
    db: at(0, 0),
    history: at(280, 0),
    train: at(560, 0),
    api: at(280, 220),
    anomaly: at(840, 120),
    llm: at(560, 320),
  };
  view('overview').positions = {
    usb: at(0, 260),
    esp32: at(280, 120),
    bme280: at(600, 0),
    oled: at(600, 160),
    vent: at(600, 320),
    mqtt: at(1000, 120),
    dashboard: at(1000, 320),
    api: at(1300, 220),
    db: at(1600, 120),
    history: at(2000, 0),
    train: at(2300, 0),
    anomaly: at(2300, 200),
    llm: at(2000, 360),
  };

  return ArchDocSchema.parse(doc);
}
