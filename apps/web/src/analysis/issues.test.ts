import { effectiveCatalog, seraIot, validate } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { issueIndex, viewForIssue } from './issues';

const catalog = effectiveCatalog();

function brokenDoc() {
  const doc = seraIot();
  // An orphan (node-only issue) and a protocol mismatch (edge issue).
  doc.nodes.push({ id: 'lonely', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} });
  doc.edges.find((e) => e.id === 'e-store')!.protocol = 'I2C';
  return doc;
}

describe('issueIndex', () => {
  it('badges edges for edge issues and nodes for node-only issues', () => {
    const { nodes, edges } = issueIndex(validate(brokenDoc(), catalog));
    expect([...nodes.keys()]).toEqual(['lonely']);
    expect(nodes.get('lonely')!.severity).toBe('info');
    expect(edges.get('e-store')).toMatchObject({ severity: 'warning' });
    expect(edges.get('e-store')!.items).toHaveLength(2);
  });
});

describe('viewForIssue', () => {
  it('stays in the current view when it shows every node involved', () => {
    const doc = brokenDoc();
    const issue = validate(doc, catalog).find((i) => i.rule === 'protocol-mismatch')!;
    expect(viewForIssue(doc, 'fullstack', issue)).toBe('fullstack');
  });

  it('falls back to the overview otherwise', () => {
    const doc = brokenDoc();
    const issue = validate(doc, catalog).find((i) => i.rule === 'protocol-mismatch')!;
    expect(viewForIssue(doc, 'hardware', issue)).toBe('overview');
  });
});
