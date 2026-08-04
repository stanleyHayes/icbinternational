import { bucketOf, decisionKey, drawBps, receiptFor, stableHash } from '../biller-outcome.js';
import { BillerRejection } from '../biller-rail.types.js';
import { BPS_SCALE, DEFAULT_REJECTION_BPS, DEFAULT_TIMEOUT_BPS } from '../biller.constants.js';
import { SimulatedBillerRail } from '../simulated-biller.rail.js';

/**
 * The rail's contract with the rest of the bank is not "it usually works". It is that the
 * same submission always gets the same answer, that a retry gets a fresh one, and that the
 * refusal rate is roughly what the constants claim — because the reversal path is built on
 * refusals actually happening.
 */
describe('biller outcome selection', () => {
  it('gives the same answer to the same submission every time', () => {
    const key = decisionKey({ paymentId: 'tro_A', reference: '1234567890', attempt: 1 });

    expect(drawBps(key)).toBe(drawBps(key));
    expect(receiptFor('tro_A')).toBe(receiptFor('tro_A'));
  });

  it('gives a retry a fresh draw, so a timeout is not a life sentence', () => {
    const first = decisionKey({ paymentId: 'tro_A', reference: '1234567890', attempt: 1 });
    const second = decisionKey({ paymentId: 'tro_A', reference: '1234567890', attempt: 2 });

    expect(first).not.toBe(second);
    expect(drawBps(first)).not.toBe(drawBps(second));
  });

  it('keeps every draw inside the basis-point range', () => {
    for (let index = 0; index < 500; index += 1) {
      const draw = drawBps(`payment-${index}`);
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThan(BPS_SCALE);
    }
  });

  it('spreads hashes rather than clustering them', () => {
    const buckets = new Set(
      Array.from({ length: 200 }, (_, index) => bucketOf(`tro_${index}`, 10)),
    );

    expect(buckets.size).toBe(10);
  });

  it('hashes distinct inputs to distinct values', () => {
    expect(stableHash('thames-water')).not.toBe(stableHash('severn-trent'));
  });

  it('issues a receipt that is recognisably a receipt', () => {
    expect(receiptFor('tro_01JQ8Z')).toMatch(/^RB[\dA-Z]{10}$/);
  });
});

describe('SimulatedBillerRail', () => {
  const rail = new SimulatedBillerRail();

  const submissionFor = (paymentId: string) => ({
    paymentId,
    billerId: 'thames-water',
    billerName: 'Thames Water',
    customerReference: '1234567890',
    amount: { amount: '4250', currency: 'GBP' as const },
    attempt: 1,
  });

  it('answers the same way twice for one submission', async () => {
    const first = await rail.submit(submissionFor('tro_STABLE'));
    const second = await rail.submit(submissionFor('tro_STABLE'));

    expect(second).toStrictEqual(first);
  });

  it('refuses a realistic share of payments, and accepts the rest', async () => {
    const sample = 2000;
    const outcomes = await Promise.all(
      Array.from({ length: sample }, async (_, index) =>
        rail.submit(submissionFor(`tro_${index}`)),
      ),
    );

    const refused = outcomes.filter((outcome) => !outcome.accepted);
    const expected = (sample * (DEFAULT_TIMEOUT_BPS + DEFAULT_REJECTION_BPS)) / BPS_SCALE;

    expect(refused.length).toBeGreaterThan(expected / 2);
    expect(refused.length).toBeLessThan(expected * 2);
  });

  it('distinguishes a refusal from silence', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 3000 }, async (_, index) => rail.submit(submissionFor(`tro_x${index}`))),
    );

    const rejections = new Set(
      outcomes.filter((outcome) => !outcome.accepted).map((outcome) => outcome.rejection),
    );

    expect(rejections.has(BillerRejection.NO_RESPONSE)).toBe(true);
    expect(rejections.size).toBeGreaterThan(1);
  });

  it('reports how long the network took on every answer', async () => {
    const outcome = await rail.submit(submissionFor('tro_LATENCY'));
    expect(outcome.latencyMs).toBeGreaterThan(0);
  });

  it('validates a reference without moving anything', async () => {
    const check = await rail.checkAccount({
      billerId: 'thames-water',
      customerReference: '1234567890',
    });

    expect(typeof check.valid).toBe('boolean');
    if (!check.valid) expect(check.rejection).toBe(BillerRejection.UNKNOWN_ACCOUNT);
  });

  it('routes a top-up through the same decision, keyed on the handset', async () => {
    const topUp = {
      paymentId: 'tro_TOPUP',
      provider: 'EE',
      phone: '07700900123',
      bundle: 'AIRTIME' as const,
      bundleCode: null,
      amount: { amount: '1000', currency: 'GBP' as const },
      attempt: 1,
    };

    expect(await rail.submitTopUp(topUp)).toStrictEqual(await rail.submitTopUp(topUp));
  });
});
