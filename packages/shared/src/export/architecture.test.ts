import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { seraIot } from '../templates';
import { architectureJson, architectureMarkdown } from './architecture';

const catalog = effectiveCatalog();

describe('ARCHITECTURE.md', () => {
  it('matches the reviewed snapshot for the Sera IoT design', () => {
    expect(architectureMarkdown(seraIot(), catalog)).toMatchSnapshot();
  });

  it('is deterministic regardless of node and edge order', () => {
    const shuffled = seraIot();
    shuffled.nodes.reverse();
    shuffled.edges.reverse();
    expect(architectureMarkdown(shuffled, catalog)).toBe(architectureMarkdown(seraIot(), catalog));
    expect(architectureJson(shuffled, catalog)).toBe(architectureJson(seraIot(), catalog));
  });

  it('lists cross-domain interfaces and one Mermaid diagram per domain', () => {
    const md = architectureMarkdown(seraIot(), catalog);
    expect(md).toContain(
      '- `e-publish`: Hardware `esp32` → Full stack `mqtt` over MQTT (Telemetry)',
    );
    expect(md.match(/```mermaid/g)).toHaveLength(3);
    expect(md).toContain('n_esp32 -->|I2C| n_bme280');
  });

  it('renders open issues with their hints in the export language', () => {
    const doc = seraIot();
    doc.nodes.push({ id: 'lonely', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} });
    expect(architectureMarkdown(doc, catalog)).toContain(
      '- **info** `orphan-node`: “Redis” is not connected to anything.',
    );
    doc.meta.exportLang = 'tr';
    expect(architectureMarkdown(doc, catalog)).toContain('“Redis” hiçbir bileşene bağlı değil.');
  });

  it('keeps table cells and Mermaid labels from breaking the markup', () => {
    const doc = seraIot();
    doc.nodes.find((n) => n.id === 'api')!.label = 'API | "v2"\nbeta';
    const md = architectureMarkdown(doc, catalog);
    expect(md).toContain('API \\| "v2" beta');
    expect(md).toContain('n_api["API | #quot;v2#quot; beta"]');
  });
});

describe('architecture.json', () => {
  it('drops editor-only state and names connections from/to', () => {
    const json = JSON.parse(architectureJson(seraIot(), catalog));
    expect(json.schemaVersion).toBe(1);
    expect(JSON.stringify(json)).not.toContain('positions');
    expect(json.connections.find((c: { id: string }) => c.id === 'e-bme')).toMatchObject({
      from: 'esp32',
      to: 'bme280',
      protocol: 'I2C',
    });
    expect(json.issues).toEqual([]);
  });
});
