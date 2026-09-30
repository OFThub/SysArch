import { exportArchitecture, generateCode, type ArchDoc, type Catalog } from '@sysarch/shared';
import { strToU8, zipSync } from 'fflate';
import { stringify } from 'yaml';

/** File-name-safe project name: "Sera IoT v2" → "sera-iot-v2". */
export const fileBase = (name: string) =>
  name
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'mimari';

/** The design itself, re-importable: raw ArchDoc as JSON or YAML. */
export const docJson = (doc: ArchDoc) => `${JSON.stringify(doc, null, 2)}\n`;
export const docYaml = (doc: ArchDoc) => stringify(doc);

/**
 * Everything the design produces, as one zip: the AI-readable description,
 * the generated code, and the source doc so the bundle can be imported back.
 */
export function codeBundle(doc: ArchDoc, catalog: Catalog): Uint8Array {
  const files = [
    ...exportArchitecture(doc, catalog),
    ...generateCode(doc, catalog),
    { path: 'sysarch.json', content: docJson(doc) },
  ];
  return zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])), { level: 6 });
}
