import type { Catalog } from './catalog';
import type { ArchDoc, ArchNode } from './schema';

/** When the price table was last checked. Shown next to every estimate. */
export const PRICE_DATE = '2026-10';

/**
 * Unit prices in USD. Flat keys are per month for one instance; `gpu-hour:*`
 * per GPU hour; `llm-in:*`/`llm-out:*` per million tokens; `object-storage-gb`
 * per GB-month. LLM rates are Anthropic first-party list prices; the cloud
 * rates are round on-demand estimates for a small managed instance. Every key
 * can be overridden per project (doc.pricingOverrides), since real bills
 * depend on region, commitment and size.
 */
export const PRICES: Readonly<Record<string, number>> = {
  container: 30,
  'managed-db': 50,
  'managed-cache': 25,
  queue: 10,
  'static-hosting': 5,
  'load-balancer': 20,
  'object-storage-gb': 0.023,
  'gpu-hour:T4': 0.53,
  'gpu-hour:L4': 0.8,
  'gpu-hour:A10G': 1.21,
  'gpu-hour:A100': 3.67,
  'gpu-hour:H100': 6.98,
  'llm-in:claude-fable-5-1': 10,
  'llm-out:claude-fable-5-1': 50,
  'llm-in:claude-opus-5-5': 4,
  'llm-out:claude-opus-5-5': 20,
  'llm-in:claude-sonnet-5-5': 2,
  'llm-out:claude-sonnet-5-5': 10,
  'llm-in:claude-haiku-4-5': 1,
  'llm-out:claude-haiku-4-5': 5,
  // Any other model, including other providers': a mid-tier rate to override.
  'llm-in:other': 3,
  'llm-out:other': 15,
};

const HOURS_PER_MONTH = 730;
const DAYS_PER_MONTH = 30;
/** Deploy targets the team runs itself: no cloud bill to estimate. */
const SELF_HOSTED = new Set(['docker', 'onprem', 'edge']);

export interface CostLine {
  nodeId: string;
  /** The price keys the amount came from, to show and to override. */
  priceKeys: string[];
  usd: number;
  /** Monthly running cost, or a one-off hardware purchase. */
  recurring: boolean;
}

export interface CostReport {
  lines: CostLine[];
  monthlyUsd: number;
  hardwareUsd: number;
  priceDate: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * What a design costs: monthly cloud and LLM spend per component and the
 * one-off price of its hardware. An estimate from list prices, to compare
 * designs and spot the expensive part, not a quote.
 */
export function costReport(doc: ArchDoc, catalog: Catalog): CostReport {
  const price = (key: string) => doc.pricingOverrides[key] ?? PRICES[key] ?? 0;
  const lines: CostLine[] = [];
  const add = (n: ArchNode, priceKeys: string[], usd: number, recurring = true) => {
    if (usd > 0) lines.push({ nodeId: n.id, priceKeys, usd: round2(usd), recurring });
  };

  for (const n of doc.nodes) {
    const key = catalog.get(n.type)?.exportHints.pricingKey;
    if (!key) continue;
    if (key === 'bom') {
      add(n, ['priceUsd'], num(n.props.priceUsd), false);
      continue;
    }
    if (n.deploy && SELF_HOSTED.has(n.deploy.target)) continue;

    const gpu = typeof n.props.gpu === 'string' && n.props.gpu !== 'Yok' ? n.props.gpu : undefined;
    if (key === 'llm') {
      const model = `${n.props.model ?? ''}`;
      const m = PRICES[`llm-in:${model}`] !== undefined ? model : 'other';
      const calls = num(n.props.requestsPerDay) * DAYS_PER_MONTH;
      const tokens =
        num(n.props.inputTokens) * price(`llm-in:${m}`) +
        num(n.props.outputTokens) * price(`llm-out:${m}`);
      add(n, [`llm-in:${m}`, `llm-out:${m}`], (calls * tokens) / 1e6);
    } else if (key === 'gpu-hour' && n.type === 'training') {
      if (gpu) add(n, [`gpu-hour:${gpu}`], num(n.props.hoursPerMonth) * price(`gpu-hour:${gpu}`));
    } else if (key === 'gpu-hour') {
      // A serving model with a GPU holds it all month; without one it is a container.
      if (gpu) add(n, [`gpu-hour:${gpu}`], HOURS_PER_MONTH * price(`gpu-hour:${gpu}`));
      else add(n, ['container'], price('container'));
    } else if (key === 'object-storage') {
      add(n, ['object-storage-gb'], num(n.props.sizeGb) * price('object-storage-gb'));
    } else add(n, [key], price(key));
  }

  lines.sort((a, b) => b.usd - a.usd || (a.nodeId < b.nodeId ? -1 : 1));
  const sum = (recurring: boolean) =>
    round2(lines.filter((l) => l.recurring === recurring).reduce((s, l) => s + l.usd, 0));
  return { lines, monthlyUsd: sum(true), hardwareUsd: sum(false), priceDate: PRICE_DATE };
}
