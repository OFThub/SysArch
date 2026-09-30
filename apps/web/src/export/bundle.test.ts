import { ArchDocSchema, effectiveCatalog, seraIot } from '@sysarch/shared';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { codeBundle, docYaml, fileBase } from './bundle';

describe('codeBundle', () => {
  it('zips the architecture docs, generated code and the source doc', () => {
    const files = unzipSync(codeBundle(seraIot(), effectiveCatalog()));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'ARCHITECTURE.md',
        'architecture.json',
        'docker-compose.yml',
        'openapi/api.yaml',
        'mosquitto/mosquitto.conf',
        'firmware/esp32/pins.h',
        'sysarch.json',
      ]),
    );
    // The bundled doc is importable again.
    const doc = JSON.parse(strFromU8(files['sysarch.json']!));
    expect(ArchDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe('docYaml', () => {
  it('round-trips to the same doc', () => {
    const doc = seraIot();
    expect(ArchDocSchema.parse(parse(docYaml(doc)))).toEqual(doc);
  });
});

describe('fileBase', () => {
  it('turns project names into safe file names, Turkish letters included', () => {
    expect(fileBase('Sera IoT v2')).toBe('sera-iot-v2');
    expect(fileBase('Ölçüm Işığı Şebekesi')).toBe('olcum-isigi-sebekesi');
    expect(fileBase('***')).toBe('mimari');
  });
});
