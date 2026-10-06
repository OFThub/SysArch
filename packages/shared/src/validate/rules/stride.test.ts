import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../../catalog';
import { ragApp, saasApp } from '../../templates';
import { validate } from '../index';

const catalog = effectiveCatalog();
const security = (doc: ReturnType<typeof saasApp>) =>
  validate(doc, catalog)
    .filter((i) => i.category === 'security')
    .map((i) => `${i.rule} ${[...i.nodeIds, ...i.edgeIds].join(',')}`);

/** The SaaS template (zoned: payments outside, balancer in front) with TLS taken off. */
function zoned() {
  const doc = saasApp();
  for (const e of doc.edges) e.props = {};
  return doc;
}

describe('STRIDE rules', () => {
  it('flags every unencrypted link that changes trust zone, and none once encrypted', () => {
    const doc = zoned();
    expect(security(doc)).toEqual([
      'unencrypted-crossing edge,web,e-web',
      'unencrypted-crossing edge,api,e-api',
      'unencrypted-crossing api,billing,e-charge',
      'unencrypted-crossing worker,mail,e-mail',
    ]);
    for (const e of doc.edges) e.props = { ...e.props, encrypted: true };
    expect(security(doc)).toEqual([]);
  });

  it('flags a public API without authentication', () => {
    const doc = saasApp();
    doc.nodes.find((n) => n.id === 'api')!.props.requiresAuth = false;
    expect(security(doc)).toEqual(['public-api-no-auth api']);
  });

  it('flags a store wired to the internet zone', () => {
    const doc = zoned();
    for (const e of doc.edges) e.props = { ...e.props, encrypted: true };
    doc.boundaries[1]!.trust = 'internet';
    doc.edges.push({
      id: 'e-leak',
      source: 'edge',
      target: 'db',
      protocol: 'SQL',
      props: { encrypted: true },
    });
    expect(security(doc)).toContain('store-exposed db,e-leak');
  });

  it('flags personal data handed straight to an outside model', () => {
    const doc = ragApp();
    doc.nodes.find((n) => n.id === 'docs')!.props.containsPii = true;
    doc.edges.push({ id: 'e-leak', source: 'docs', target: 'llm', protocol: 'HTTP', props: {} });
    expect(security(doc)).toEqual(['pii-to-external docs,llm,e-leak']);
  });
});
