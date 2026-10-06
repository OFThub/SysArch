import { effectiveCatalog, type Catalog } from '../catalog';
import type { ArchDoc } from '../schema';
import { runRules } from './engine';
import { i2cAddressConflict, missingPinRoles, pinConflict, pinRoleUnsupported } from './rules/bus';
import { protocolMismatch, unknownType } from './rules/compat';
import { frontendToStore, modelWithoutSource, orphanNode } from './rules/design';
import { flowBroken, flowSla } from './rules/flows';
import { STRIDE_RULES } from './rules/stride';
import { pinVoltage } from './rules/voltage';
import { SIM_RULES } from '../simulate';
import type { Issue, Rule } from './types';

export * from './types';
export { describeIssue, ruleContext, runRules } from './engine';
export { i2cBuses, normalizeI2cAddress, type I2cBus } from './rules/bus';
export { ENCRYPTABLE } from './rules/stride';

/** Every rule the analysis panel and exports run, in reporting order. */
export const RULES: readonly Rule[] = [
  unknownType,
  protocolMismatch,
  pinVoltage,
  missingPinRoles,
  pinRoleUnsupported,
  pinConflict,
  i2cAddressConflict,
  frontendToStore,
  modelWithoutSource,
  orphanNode,
  flowBroken,
  ...SIM_RULES,
  flowSla,
  ...STRIDE_RULES,
];

export const validate = (doc: ArchDoc, catalog: Catalog) => runRules(doc, catalog, RULES);

/** Issues `after` has and `before` did not: what a proposed change would introduce. */
export function newIssues(before: ArchDoc, after: ArchDoc): Issue[] {
  const known = new Set(validate(before, effectiveCatalog(before.customTypes)).map((i) => i.id));
  return validate(after, effectiveCatalog(after.customTypes)).filter((i) => !known.has(i.id));
}
