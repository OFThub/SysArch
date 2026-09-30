import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { effectiveCatalog } from '../catalog';
import { seraIot } from '../templates';
import { composeFiles, generateCode, mqttFiles, openApiFiles, pinsFiles } from './generators';

const catalog = effectiveCatalog();
const file = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path)!.content;

describe('docker-compose', () => {
  const files = composeFiles(seraIot(), catalog);
  const compose = parse(file(files, 'docker-compose.yml'));

  it('builds custom code from service folders and pulls infrastructure images by engine', () => {
    expect(compose.services.api).toMatchObject({ build: './services/api' });
    expect(compose.services.mqtt.image).toBe('eclipse-mosquitto:2');
    expect(compose.services.db.image).toBe('postgres:17-alpine');
    expect(files.map((f) => f.path)).toContain('services/api/README.md');
    // Hardware never lands in compose.
    expect(Object.keys(compose.services)).not.toContain('esp32');
  });

  it('orders start-up by who calls whom', () => {
    expect(compose.services.api.depends_on).toEqual(['anomaly', 'db', 'mqtt']);
    expect(compose.services.dashboard.depends_on).toEqual(['api']);
  });

  it('never writes a secret: passwords come from .env', () => {
    expect(compose.services.db.environment.POSTGRES_PASSWORD).toBe(
      '${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}',
    );
    expect(compose.volumes).toHaveProperty('db-data');
  });

  it('leaves out components deployed somewhere other than Docker', () => {
    const doc = seraIot();
    doc.nodes.find((n) => n.id === 'db')!.deploy = { target: 'aws' };
    expect(
      parse(file(composeFiles(doc, catalog), 'docker-compose.yml')).services,
    ).not.toHaveProperty('db');
  });
});

describe('OpenAPI', () => {
  it('writes one spec per HTTP payload receiver with typed request bodies', () => {
    const files = openApiFiles(seraIot());
    expect(files.map((f) => f.path)).toEqual(['openapi/anomaly.yaml', 'openapi/api.yaml']);
    const api = parse(file(files, 'openapi/api.yaml'));
    expect(api.openapi).toBe('3.1.0');
    expect(api.paths).toHaveProperty('/readings');
    expect(api.components.schemas.Readings.properties.series).toEqual({
      type: 'array',
      items: { type: 'object', description: 'Reading' },
    });
  });
});

describe('MQTT', () => {
  it('locks the broker down and documents topics', () => {
    const files = mqttFiles(seraIot());
    expect(file(files, 'mosquitto/mosquitto.conf')).toContain('allow_anonymous false');
    const topics = file(files, 'mosquitto/topics.md');
    expect(topics).toContain('`sera/+/telemetry`');
    expect(topics).toContain('ESP32-S3, Sera API');
  });

  it('writes nothing without MQTT links', () => {
    const doc = seraIot();
    doc.edges = doc.edges.filter((e) => e.protocol !== 'MQTT');
    expect(mqttFiles(doc)).toEqual([]);
  });
});

describe('pins.h', () => {
  it('defines the shared I2C bus once, device addresses, and other links per device', () => {
    const [header, ...rest] = pinsFiles(seraIot());
    expect(rest).toEqual([]);
    expect(header!.path).toBe('firmware/esp32/pins.h');
    expect(header!.content).toContain('#define I2C0_SDA 8  // GPIO8');
    expect(header!.content).toContain('#define I2C0_SCL 9  // GPIO9');
    expect(header!.content).toContain('#define BME280_I2C_ADDR 0x76');
    expect(header!.content).toContain('#define SSD1306_OLED_I2C_ADDR 0x3c');
    expect(header!.content).toContain('#define HAVALANDIRMA_SERVOSU_PWM 4  // GPIO4');
    expect(header!.content).not.toContain('VCC');
    // Network links have no pins and no section.
    expect(header!.content).not.toContain('MQTT');
  });
});

describe('generateCode', () => {
  it('is deterministic', () => {
    const shuffled = seraIot();
    shuffled.nodes.reverse();
    shuffled.edges.reverse();
    expect(generateCode(shuffled, catalog)).toEqual(generateCode(seraIot(), catalog));
  });
});
