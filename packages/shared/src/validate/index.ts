import type { Catalog } from '../catalog';
import type { ArchDoc } from '../schema';
import { runRules } from './engine';
import { i2cAddressConflict, missingPinRoles, pinConflict, pinRoleUnsupported } from './rules/bus';
import { protocolMismatch, unknownType } from './rules/compat';
import { frontendToStore, modelWithoutSource, orphanNode } from './rules/design';
import { pinVoltage } from './rules/voltage';
import type { Rule } from './types';

export * from './types';
export { describeIssue, ruleContext, runRules } from './engine';
export { i2cBuses, normalizeI2cAddress, type I2cBus } from './rules/bus';

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
];

export const validate = (doc: ArchDoc, catalog: Catalog) => runRules(doc, catalog, RULES);
