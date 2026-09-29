import type { Catalog } from '../catalog';
import type { ArchDoc } from '../schema';
import { runRules } from './engine';
import { protocolMismatch, unknownType } from './rules/compat';
import { frontendToStore, modelWithoutSource, orphanNode } from './rules/design';
import type { Rule } from './types';

export * from './types';
export { describeIssue, ruleContext, runRules } from './engine';

/** Every rule the analysis panel and exports run, in reporting order. */
export const RULES: readonly Rule[] = [
  unknownType,
  protocolMismatch,
  frontendToStore,
  modelWithoutSource,
  orphanNode,
];

export const validate = (doc: ArchDoc, catalog: Catalog) => runRules(doc, catalog, RULES);
