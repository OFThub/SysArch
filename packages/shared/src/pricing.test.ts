import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from './catalog';
import { costReport } from './pricing';
import { ragApp, seraIot } from './templates';

const catalog = effectiveCatalog();
const usd = (doc: ReturnType<typeof ragApp>, id: string) =>
  costReport(doc, catalog).lines.find((l) => l.nodeId === id)?.usd;

describe('cost report', () => {
  it('prices an LLM by requests and tokens, a GPU server by the month', () => {
    const doc = ragApp();
    // 5000/day × 30 × (6000 × $2 + 500 × $10) per million tokens
    expect(usd(doc, 'llm')).toBe(2550);
    // An L4 held all month: 730 h × $0.80
    expect(usd(doc, 'embed')).toBe(584);
    expect(usd(doc, 'history')).toBe(50);
  });

  it('applies project overrides and skips self-hosted parts', () => {
    const doc = ragApp();
    doc.pricingOverrides = { 'llm-in:claude-sonnet-5-5': 1, 'managed-db': 80 };
    expect(usd(doc, 'llm')).toBe(1650);
    expect(usd(doc, 'history')).toBe(80);
    doc.nodes.find((n) => n.id === 'history')!.deploy = { target: 'docker' };
    expect(usd(doc, 'history')).toBeUndefined();
  });

  it('keeps hardware apart as a one-off total, priciest line first', () => {
    const r = costReport(seraIot(), catalog);
    // ESP32-S3 15 + BME280 6 + OLED 4 + servo 2 + USB supply 3
    expect(r.hardwareUsd).toBe(30);
    expect(r.lines.filter((l) => !l.recurring).every((l) => l.priceKeys[0] === 'priceUsd')).toBe(
      true,
    );
    expect(r.lines.map((l) => l.usd)).toEqual([...r.lines.map((l) => l.usd)].sort((a, b) => b - a));
    expect(r.monthlyUsd).toBe(
      Math.round(r.lines.filter((l) => l.recurring).reduce((s, l) => s + l.usd, 0) * 100) / 100,
    );
  });
});
