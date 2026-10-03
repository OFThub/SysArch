import { seraIot } from '@sysarch/shared';
import { describe, expect, it } from 'vitest';
import { pulseAt } from './playback';

const withFlow = (steps: string[]) => {
  const doc = seraIot();
  doc.flows.push({ id: 'f', name: 'Telemetri', steps });
  return doc;
};

describe('pulseAt', () => {
  it('follows the flow, including links it travels against their arrow', () => {
    const doc = withFlow(['e-publish', 'e-subscribe', 'e-store']);
    expect(pulseAt(doc, 'f', 0)).toEqual({ edgeId: 'e-publish', reverse: false });
    // e-subscribe points api -> mqtt; the flow comes from mqtt.
    expect(pulseAt(doc, 'f', 1)).toEqual({ edgeId: 'e-subscribe', reverse: true });
    expect(pulseAt(doc, 'f', 2)).toEqual({ edgeId: 'e-store', reverse: false });
    expect(pulseAt(doc, 'f', 3)).toBeUndefined();
    expect(pulseAt(doc, null, 0)).toBeUndefined();
  });

  it('stops at the step where a flow breaks', () => {
    const doc = withFlow(['e-publish', 'e-store']);
    expect(pulseAt(doc, 'f', 0)).toBeDefined();
    expect(pulseAt(doc, 'f', 1)).toBeUndefined();
  });
});
