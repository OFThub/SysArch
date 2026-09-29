import type { Catalog } from '../catalog';
import type { ArchDoc, ArchEdge, ArchNode } from '../schema';

export type Severity = 'error' | 'warning' | 'info';
export type Category = 'compat' | 'sim' | 'security' | 'cost';
export type Lang = 'tr' | 'en';
export type Params = Record<string, string | number>;

/** What a rule reports; the engine turns it into an Issue. */
export interface Finding {
  severity: Severity;
  nodeIds: string[];
  edgeIds: string[];
  /** Values for the rule's message templates (labels, numbers, names). */
  params: Params;
}

/** Lookups every rule needs, built once per validation run. */
export interface RuleContext {
  doc: ArchDoc;
  catalog: Catalog;
  node: (id: string) => ArchNode | undefined;
  edgesOf: (nodeId: string) => ArchEdge[];
}

/**
 * A check over the whole doc. Rules return findings with parameters rather
 * than sentences so each language renders its own text: the UI in Turkish,
 * ARCHITECTURE.md in the doc's export language.
 */
export interface Rule {
  id: string;
  category: Category;
  check: (ctx: RuleContext) => Finding[];
  text: Record<Lang, (p: Params) => { message: string; hint?: string }>;
}

/**
 * One problem found in the design. Simulation, STRIDE and cost checks report
 * through the same shape, so there is one analysis panel and one export
 * section. The id is deterministic for stable keys and focus links.
 */
export interface Issue extends Finding {
  id: string;
  rule: string;
  category: Category;
}
