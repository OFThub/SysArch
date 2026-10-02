import { flowTrace } from '../../flows';
import type { Rule } from '../types';

const round = (v: number) => Math.round(v * 10) / 10;

/** A flow that takes longer than its target time, counted along its steps. */
export const flowSla: Rule = {
  id: 'flow-sla',
  category: 'sim',
  check: ({ doc }) =>
    doc.flows.flatMap((f) => {
      if (f.slaMs === undefined) return [];
      const trace = flowTrace(doc, f);
      if (trace.brokenAt !== undefined || trace.totalMs <= f.slaMs) return [];
      return [
        {
          severity: 'warning',
          nodeIds: trace.nodeIds,
          edgeIds: f.steps,
          params: { name: f.name, totalMs: round(trace.totalMs), slaMs: f.slaMs },
          key: f.id,
        },
      ];
    }),
  text: {
    tr: (p) => ({
      message: `“${p.name}” akışı ${p.totalMs} ms sürüyor, hedef ${p.slaMs} ms.`,
      hint: 'Yoldaki en yavaş bileşeni hızlandır, adım sayısını azalt ya da hedefi gözden geçir.',
    }),
    en: (p) => ({
      message: `Flow “${p.name}” takes ${p.totalMs} ms against a target of ${p.slaMs} ms.`,
      hint: 'Speed up the slowest component on the way, cut steps, or revisit the target.',
    }),
  },
};

/** A flow whose steps do not join up, usually after a link was deleted or rewired. */
export const flowBroken: Rule = {
  id: 'flow-broken',
  category: 'compat',
  check: ({ doc }) =>
    doc.flows.flatMap((f) => {
      const { brokenAt, nodeIds } = flowTrace(doc, f);
      if (brokenAt === undefined) return [];
      const step = f.steps[brokenAt];
      return [
        {
          severity: 'warning',
          nodeIds,
          edgeIds: step ? [step] : [],
          params: { name: f.name, step: brokenAt + 1 },
          key: f.id,
        },
      ];
    }),
  text: {
    tr: (p) => ({
      message: `“${p.name}” akışı ${p.step}. adımda kopuyor.`,
      hint: 'Her adım, bir öncekinin bittiği bileşenden devam etmeli. Adımları sırala ya da eksik bağlantıyı ekle.',
    }),
    en: (p) => ({
      message: `Flow “${p.name}” breaks at step ${p.step}.`,
      hint: 'Each step must continue from the component the previous one ended at. Reorder the steps or add the missing link.',
    }),
  },
};
