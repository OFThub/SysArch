import type { Catalog } from '../catalog';
import type { ArchDoc, ArchEdge } from '../schema';
import type { Issue, Lang, Rule, RuleContext } from './types';

export function ruleContext(doc: ArchDoc, catalog: Catalog): RuleContext {
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const edges = new Map<string, ArchEdge[]>();
  for (const e of doc.edges)
    for (const id of [e.source, e.target]) edges.set(id, [...(edges.get(id) ?? []), e]);
  return {
    doc,
    catalog,
    node: (id) => nodes.get(id),
    edgesOf: (id) => edges.get(id) ?? [],
  };
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Runs every rule; issues come back most severe first, then in rule order. */
export function runRules(doc: ArchDoc, catalog: Catalog, rules: readonly Rule[]): Issue[] {
  const ctx = ruleContext(doc, catalog);
  const issues = rules.flatMap((rule) =>
    rule.check(ctx).map((f) => ({
      ...f,
      rule: rule.id,
      category: rule.category,
      id: [rule.id, ...f.nodeIds, ...f.edgeIds, f.key ?? ''].join(':'),
    })),
  );
  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Renders an issue's text in a language, using the rule that raised it. */
export function describeIssue(issue: Issue, rules: readonly Rule[], lang: Lang) {
  const rule = rules.find((r) => r.id === issue.rule);
  return rule ? rule.text[lang](issue.params) : { message: issue.rule };
}
