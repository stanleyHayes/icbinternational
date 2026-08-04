import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { PaymentRailName, type RailPaymentInstruction } from '../../ports/payment-rail.types.js';
import { OUTAGE_REASON_CODE } from '../kernel.constants.js';
import { type RailBehaviourProfile } from '../kernel.types.js';
import { seededInt } from '../seeded-random.js';
import { RailSimulatorKernel } from '../simulator-kernel.js';

/** No failures, quick answers: the neutral profile most tests run under. */
const QUIET: RailBehaviourProfile = {
  failureRateBps: 0,
  latencyMinMs: 250,
  latencyMaxMs: 2_500,
  forceOutage: false,
};

/** A Monday morning, so every test starts on a business day. */
const T0 = new Date(Date.UTC(2026, 7, 3, 8, 0, 0));

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Builds an instruction whose every choice derives from the test seed — never Math.random. */
function instruction(seed: string, index: number): RailPaymentInstruction {
  const rails = [PaymentRailName.ACH, PaymentRailName.RTGS, PaymentRailName.SWIFT] as const;
  const rail = rails[seededInt(seed, `op-${index}:rail`, rails.length)] ?? rails[0];

  const id = seededInt(seed, `op-${index}:id`, 100_000);

  return {
    instructionId: `pay_${id}`,
    rail,
    amount: Money.fromMinor(BigInt(100 + seededInt(seed, `op-${index}:amt`, 90_000)), 'GBP'),
    ordering: { accountReference: '11223344', bankCode: 'RLNCGB2L', name: 'A Payer' },
    beneficiary: { accountReference: '55667788', bankCode: 'BARCGB22', name: 'B Payee' },
    reference: `Invoice ${index}`,
    attempt: 1 + seededInt(seed, `op-${index}:attempt`, 2),
  };
}

/** Canonical JSON: sorted keys, dates rendered, so two runs compare byte for byte. */
function canonical(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalise);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, normalise(entry)] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries);
  }
  return value;
}

/** One deterministic move in an operation script. */
type Step =
  | { kind: 'submit'; instruction: RailPaymentInstruction; at: Date }
  | { kind: 'track'; instructionId: string; at: Date }
  | { kind: 'return'; instructionId: string; at: Date };

/** Runs a script against a kernel, rendering every outcome — errors included — canonically. */
function runScript(kernel: RailSimulatorKernel, script: readonly Step[]): string[] {
  return script.map((step) => {
    try {
      if (step.kind === 'submit') return canonical(kernel.submit(step.instruction, step.at));
      if (step.kind === 'track') return canonical(kernel.track(step.instructionId, step.at));
      return canonical(
        kernel.requestReturn({ instructionId: step.instructionId, reasonCode: 'R01' }, step.at),
      );
    } catch (error) {
      if (error instanceof AppError) return `ERROR:${error.code}`;
      throw error;
    }
  });
}

/**
 * Builds a deterministic script: submissions on various rails, tracks against known
 * and unknown ids, returns, all at instants that advance through the week.
 */
function buildScript(seed: string, length: number): Step[] {
  const steps: Step[] = [];
  for (let index = 0; index < length; index += 1) {
    const at = new Date(T0.getTime() + seededInt(seed, `t-${index}`, 6_000) * MINUTE_MS);
    const kind = seededInt(seed, `kind-${index}`, 10);
    const op = instruction(seed, index);

    if (kind < 5) steps.push({ kind: 'submit', instruction: op, at });
    else if (kind < 8) steps.push({ kind: 'track', instructionId: op.instructionId, at });
    else steps.push({ kind: 'return', instructionId: op.instructionId, at });
  }
  return steps;
}

describe('kernel determinism (acceptance: same seed, identical outcomes)', () => {
  it('produces byte-identical outcomes for two kernels fed the same script', () => {
    const script = buildScript('acceptance', 60);

    const first = runScript(new RailSimulatorKernel({ seed: 'reliance', profile: QUIET }), script);
    const second = runScript(new RailSimulatorKernel({ seed: 'reliance', profile: QUIET }), script);

    expect(first.join('\n')).toBe(second.join('\n'));
  });

  it('changes outcomes when the seed changes', () => {
    const script = buildScript('seeded', 40);

    const first = runScript(new RailSimulatorKernel({ seed: 'reliance', profile: QUIET }), script);
    const other = runScript(new RailSimulatorKernel({ seed: 'different', profile: QUIET }), script);

    expect(first.join('\n')).not.toBe(other.join('\n'));
  });

  it('does not reshuffle existing operations when a new one is inserted', () => {
    const kernelA = new RailSimulatorKernel({ seed: 'reliance', profile: QUIET });
    const kernelB = new RailSimulatorKernel({ seed: 'reliance', profile: QUIET });
    const first = instruction('stable', 1);
    const second = instruction('stable', 2);
    const third = instruction('stable', 3);
    const intruder = instruction('stable', 99);

    const straightThrough = [first, second, third].map((op) => canonical(kernelA.submit(op, T0)));

    const withIntruder = [
      canonical(kernelB.submit(first, T0)),
      canonical(kernelB.submit(intruder, T0)),
      canonical(kernelB.submit(second, T0)),
      canonical(kernelB.submit(third, T0)),
    ].filter((_, index) => index !== 1);

    expect(withIntruder).toEqual(straightThrough);
  });
});

describe('failure injection is config-driven', () => {
  const SEED = 'failure-lab';
  const OPS = Array.from({ length: 60 }, (_, index) => instruction(SEED, index));

  function refusalCount(failureRateBps: number): number {
    const kernel = new RailSimulatorKernel({
      seed: SEED,
      profile: { ...QUIET, failureRateBps },
    });
    return OPS.filter((op) => !kernel.submit(op, T0).accepted).length;
  }

  it('refuses nothing at 0 bps and everything at 10 000 bps', () => {
    expect(refusalCount(0)).toBe(0);
    expect(refusalCount(10_000)).toBe(OPS.length);
  });

  it('refusals grow monotonically with the configured rate', () => {
    const rates = [0, 100, 500, 1_000, 3_000, 7_500, 9_999];
    const counts = rates.map(refusalCount);

    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeGreaterThanOrEqual(counts[index - 1] ?? 0);
    }
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0] ?? 0);
  });

  it('an operation is refused exactly when its seeded draw crosses the rate', () => {
    const rate = 3_000;
    const kernel = new RailSimulatorKernel({
      seed: SEED,
      profile: { ...QUIET, failureRateBps: rate },
    });

    for (const op of OPS) {
      const draw = seededInt(SEED, `${op.rail}:${op.instructionId}:${op.attempt}:fail`, 10_000);
      expect(kernel.submit(op, T0).accepted).toBe(draw >= rate);
    }
  });

  it('forceOutage refuses everything as a retryable outage, whatever the rate', () => {
    const kernel = new RailSimulatorKernel({
      seed: SEED,
      profile: { ...QUIET, forceOutage: true },
    });

    for (const op of OPS.slice(0, 10)) {
      const outcome = kernel.submit(op, T0);
      expect(outcome.accepted).toBe(false);
      if (!outcome.accepted) {
        expect(outcome.reasonCode).toBe(OUTAGE_REASON_CODE);
        expect(outcome.retryable).toBe(true);
      }
    }
  });

  it('honours a runtime override through configureRail', () => {
    const kernel = new RailSimulatorKernel({ seed: SEED, profile: QUIET });
    kernel.configureRail(PaymentRailName.SWIFT, { ...QUIET, failureRateBps: 10_000 });

    const swift = { ...instruction(SEED, 7), rail: PaymentRailName.SWIFT };
    const ach = { ...instruction(SEED, 7), rail: PaymentRailName.ACH };

    expect(kernel.submit(swift, T0).accepted).toBe(false);
    expect(kernel.submit(ach, T0).accepted).toBe(true);
  });
});

describe('honest rail behaviour', () => {
  it('settles an accepted payment into the batch its cut-off window implies', () => {
    const kernel = new RailSimulatorKernel({ seed: 'settle', profile: QUIET });
    const outcome = kernel.submit(instruction('settle', 1), T0);

    expect(outcome.accepted).toBe(true);
    if (outcome.accepted) {
      expect(outcome.batchId).toMatch(/^BATCH-[A-Z]+-\d{8}-\d{2}$/);
      expect(outcome.expectedSettlementAt.getTime()).toBeGreaterThan(T0.getTime());
      expect(outcome.valueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('moves a payment through SUBMITTED → IN_TRANSIT → SETTLED as time advances', () => {
    const kernel = new RailSimulatorKernel({ seed: 'lifecycle', profile: QUIET });
    const op = { ...instruction('lifecycle', 1), rail: PaymentRailName.ACH };
    kernel.submit(op, T0);

    expect(kernel.track(op.instructionId, T0).state).toBe('SUBMITTED');
    expect(kernel.track(op.instructionId, new Date(T0.getTime() + 120 * MINUTE_MS)).state).toBe(
      'IN_TRANSIT',
    );
    expect(kernel.track(op.instructionId, new Date(T0.getTime() + 3 * DAY_MS)).state).toBe(
      'SETTLED',
    );
  });

  it('returns a settled payment, citing the reason code on the report', () => {
    const kernel = new RailSimulatorKernel({ seed: 'returns', profile: QUIET });
    const op = { ...instruction('returns', 1), rail: PaymentRailName.ACH };
    kernel.submit(op, T0);
    const later = new Date(T0.getTime() + 3 * DAY_MS);

    const report = kernel.requestReturn(
      { instructionId: op.instructionId, reasonCode: 'R03' },
      later,
    );

    expect(report.state).toBe('RETURNED');
    expect(report.returnReasonCode).toBe('R03');
    expect(report.timeline.at(-1)?.detail).toContain('R03');
  });

  it('refuses to return what is already final, with a coded error', () => {
    const kernel = new RailSimulatorKernel({
      seed: 'final',
      profile: { ...QUIET, failureRateBps: 10_000 },
    });
    const op = instruction('final', 1);
    kernel.submit(op, T0);

    expect(() =>
      kernel.requestReturn({ instructionId: op.instructionId, reasonCode: 'R03' }, T0),
    ).toThrow(AppError);
  });

  it('answers unknown instructions and unknown reason codes with coded errors', () => {
    const kernel = new RailSimulatorKernel({ seed: 'errors', profile: QUIET });

    expect(() => kernel.track('pay_ghost', T0)).toThrow(AppError);
    expect(() =>
      kernel.requestReturn({ instructionId: 'pay_ghost', reasonCode: 'R03' }, T0),
    ).toThrow(AppError);

    const op = instruction('errors', 1);
    kernel.submit(op, T0);
    expect(() =>
      kernel.requestReturn({ instructionId: op.instructionId, reasonCode: 'X99' }, T0),
    ).toThrow(AppError);
  });

  it('refuses malformed profiles at construction and configuration', () => {
    expect(
      () =>
        new RailSimulatorKernel({
          seed: 's',
          profile: { ...QUIET, failureRateBps: 10_001 },
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new RailSimulatorKernel({
          seed: 's',
          profile: { ...QUIET, latencyMinMs: 5_000, latencyMaxMs: 100 },
        }),
    ).toThrow(RangeError);

    const kernel = new RailSimulatorKernel({ seed: 's', profile: QUIET });
    expect(() =>
      kernel.configureRail(PaymentRailName.ACH, { ...QUIET, failureRateBps: -1 }),
    ).toThrow(RangeError);
  });
});
