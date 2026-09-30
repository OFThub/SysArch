import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { seraIot } from '../templates';
import { describeIssue, newIssues, RULES, validate } from './index';

const catalog = effectiveCatalog();
const rulesOf = (doc: ReturnType<typeof seraIot>) => validate(doc, catalog).map((i) => i.rule);

describe('validate', () => {
  it('finds nothing wrong with the Sera IoT reference design', () => {
    expect(validate(seraIot(), catalog)).toEqual([]);
  });

  it('reports a type missing from the catalog, and only that', () => {
    const doc = seraIot();
    doc.nodes.find((n) => n.id === 'bme280')!.type = 'thermo';
    expect(rulesOf(doc)).toEqual(['unknown-type']);
  });

  it('reports each end that does not speak the edge protocol', () => {
    const doc = seraIot();
    doc.edges.find((e) => e.id === 'e-store')!.protocol = 'I2C';
    const issues = validate(doc, catalog);
    // Neither the API nor the database speaks I2C.
    expect(issues.map((i) => [i.rule, i.nodeIds[0]])).toEqual([
      ['protocol-mismatch', 'api'],
      ['protocol-mismatch', 'db'],
    ]);
    expect(new Set(issues.map((i) => i.id)).size).toBe(2);
  });

  it('flags a frontend wired straight to a data store, in either direction', () => {
    const doc = seraIot();
    doc.edges.push({ id: 'x', source: 'db', target: 'dashboard', protocol: 'SQL', props: {} });
    const issue = validate(doc, catalog).find((i) => i.rule === 'frontend-to-store')!;
    expect(issue).toMatchObject({ category: 'security', nodeIds: ['dashboard', 'db'] });
  });

  it('asks where a model server gets its model', () => {
    const doc = seraIot();
    doc.edges = doc.edges.filter((e) => e.id !== 'e-deploy');
    doc.nodes.find((n) => n.id === 'anomaly')!.props.model = '';
    expect(rulesOf(doc)).toContain('model-without-source');
    // A named model is enough, even without a training job.
    doc.nodes.find((n) => n.id === 'anomaly')!.props.model = 'isolation-forest';
    expect(rulesOf(doc)).not.toContain('model-without-source');
  });

  it('notes orphans only when the design has more than one component', () => {
    const doc = seraIot();
    doc.nodes.push({ id: 'lonely', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} });
    expect(rulesOf(doc)).toEqual(['orphan-node']);
    doc.nodes = [doc.nodes.at(-1)!];
    doc.edges = [];
    doc.views = doc.views.map((v) => ({ ...v, positions: {} }));
    expect(validate(doc, catalog)).toEqual([]);
  });

  it('orders issues by severity and renders them in both languages', () => {
    const doc = seraIot();
    doc.nodes.push({ id: 'lonely', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} });
    doc.nodes.find((n) => n.id === 'bme280')!.type = 'thermo';
    const issues = validate(doc, catalog);
    expect(issues.map((i) => i.severity)).toEqual(['error', 'info']);
    expect(describeIssue(issues[1]!, RULES, 'tr').message).toBe(
      '“Redis” hiçbir bileşene bağlı değil.',
    );
    expect(describeIssue(issues[1]!, RULES, 'en').message).toBe(
      '“Redis” is not connected to anything.',
    );
  });

  it('gives every rule a message in both languages', () => {
    for (const rule of RULES) {
      expect(rule.text.tr({}).message.length, rule.id).toBeGreaterThan(0);
      expect(rule.text.en({}).message.length, rule.id).toBeGreaterThan(0);
    }
  });
});

describe('newIssues', () => {
  it('reports only what a change introduces, not what was already wrong', () => {
    // Both start with the same unknown type, which is not news.
    const broken = () => {
      const doc = seraIot();
      doc.nodes.find((n) => n.id === 'bme280')!.type = 'thermo';
      return doc;
    };
    const before = broken();
    const after = broken();
    after.nodes.push({
      id: 'lonely',
      domain: 'fullstack',
      type: 'cache',
      label: 'Redis',
      props: {},
    });

    const introduced = newIssues(before, after);
    expect(introduced.map((i) => [i.rule, i.nodeIds])).toEqual([['orphan-node', ['lonely']]]);
    // Fixing an issue introduces nothing.
    expect(newIssues(after, before)).toEqual([]);
  });
});
