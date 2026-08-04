import { Money } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import {
  arrearsAmount,
  bucketForDays,
  daysPastDue,
  isLateFeeCharged,
  overdueInstalments,
  PROVISION_RATE_BPS,
  requiredProvision,
  unpaidPortion,
} from '../arrears.js';
import { ARREARS_GRACE_DAYS } from '../loan.constants.js';
import { DpdBucket } from '../loan.types.js';

import { aLoan, FIXTURE_CURRENCY, withInstalmentsPaid } from './loan-fixtures.js';

/** A fixed instant. The clock is simulated everywhere else; a fixture needs no clock. */
const PAID_AT = new Date('2026-04-15T10:00:00.000Z');

/**
 * Arrears detection, driven entirely by the business date.
 *
 * Every case is "here is a schedule, here is what day it is" — no clock, no database. That
 * is what makes advancing the simulated clock produce real arrears rather than nothing,
 * and it is why the whole 30/60/90 ladder can be walked in one test.
 */

function money(major: string): Money {
  return Money.fromMajor(major, FIXTURE_CURRENCY);
}

describe('bucketForDays', () => {
  const boundaries: [number, DpdBucket][] = [
    [0, DpdBucket.CURRENT],
    [1, DpdBucket.DPD_1_29],
    [29, DpdBucket.DPD_1_29],
    [30, DpdBucket.DPD_30_59],
    [59, DpdBucket.DPD_30_59],
    [60, DpdBucket.DPD_60_89],
    [89, DpdBucket.DPD_60_89],
    [90, DpdBucket.DPD_90_PLUS],
    [365, DpdBucket.DPD_90_PLUS],
  ];

  it.each(boundaries)('puts %i days past due in %s', (days, bucket) => {
    expect(bucketForDays(days)).toBe(bucket);
  });
});

describe('PROVISION_RATE_BPS', () => {
  it('never provisions less as an account falls further behind', () => {
    const ladder = [
      DpdBucket.CURRENT,
      DpdBucket.DPD_1_29,
      DpdBucket.DPD_30_59,
      DpdBucket.DPD_60_89,
      DpdBucket.DPD_90_PLUS,
    ].map((bucket) => PROVISION_RATE_BPS[bucket]);

    expect([...ladder].sort((left, right) => (left < right ? -1 : 1))).toEqual(ladder);
  });

  it('provisions the whole exposure once an account is ninety days down', () => {
    const provision = requiredProvision(money('5000.00'), DpdBucket.DPD_90_PLUS);

    expect(provision.equals(money('5000.00'))).toBe(true);
  });

  it('holds a small collective allowance even on a performing loan', () => {
    expect(requiredProvision(money('5000.00'), DpdBucket.CURRENT).equals(money('50.00'))).toBe(
      true,
    );
  });
});

describe('overdueInstalments', () => {
  const loan = aLoan();

  it('finds nothing before the first instalment falls due', () => {
    expect(overdueInstalments(loan.schedule, '2026-02-01')).toHaveLength(0);
  });

  it('allows the grace period before treating a payment as missed', () => {
    const withinGrace = `2026-02-${String(15 + ARREARS_GRACE_DAYS).padStart(2, '0')}`;

    expect(overdueInstalments(loan.schedule, withinGrace)).toHaveLength(0);
  });

  it('treats an instalment as missed the day after grace expires', () => {
    const afterGrace = `2026-02-${String(16 + ARREARS_GRACE_DAYS).padStart(2, '0')}`;

    expect(overdueInstalments(loan.schedule, afterGrace)).toHaveLength(1);
  });

  it('ignores instalments that were paid', () => {
    const caughtUp = withInstalmentsPaid(loan, 3);

    expect(overdueInstalments(caughtUp.schedule, '2026-04-30')).toHaveLength(0);
  });

  it('counts every missed instalment, not just the latest', () => {
    expect(overdueInstalments(loan.schedule, '2026-05-30')).toHaveLength(4);
  });
});

describe('daysPastDue', () => {
  const loan = aLoan();

  it('is nil on a loan that is up to date', () => {
    expect(daysPastDue(withInstalmentsPaid(loan, 2).schedule, '2026-03-20')).toBe(0);
  });

  it('measures from the oldest unpaid instalment, not the most recent', () => {
    // February missed; March and April paid. Still three months down on February.
    const schedule = loan.schedule.map((row) =>
      row.instalment === 2 || row.instalment === 3
        ? { ...row, status: 'PAID' as const, paidAmount: row.payment, paidAt: PAID_AT }
        : row,
    );

    expect(daysPastDue(schedule, '2026-05-15')).toBe(89);
  });
});

describe('arrearsAmount', () => {
  const loan = aLoan();

  it('is nil when nothing is overdue', () => {
    expect(arrearsAmount(loan.schedule, '2026-02-01', FIXTURE_CURRENCY).isZero).toBe(true);
  });

  it('sums the missed instalments', () => {
    const twoMissed = arrearsAmount(loan.schedule, '2026-03-30', FIXTURE_CURRENCY);
    const instalment = Money.fromJSON({
      amount: loan.monthlyPayment.amount,
      currency: FIXTURE_CURRENCY,
    });

    expect(twoMissed.equals(instalment.times(2))).toBe(true);
  });

  it('counts only the unpaid part of a partly met instalment', () => {
    const schedule = loan.schedule.map((row) =>
      row.instalment === 1
        ? { ...row, status: 'PARTIAL' as const, paidAmount: toStored(money('100.00')) }
        : row,
    );

    const arrears = arrearsAmount(schedule, '2026-02-28', FIXTURE_CURRENCY);
    const instalment = Money.fromJSON({
      amount: loan.monthlyPayment.amount,
      currency: FIXTURE_CURRENCY,
    });

    expect(arrears.equals(instalment.minus(money('100.00')))).toBe(true);
  });

  it('includes late fees charged against a missed instalment', () => {
    const schedule = loan.schedule.map((row) =>
      row.instalment === 1 ? { ...row, fees: toStored(money('12.00')) } : row,
    );

    const withFee = arrearsAmount(schedule, '2026-02-28', FIXTURE_CURRENCY);
    const withoutFee = arrearsAmount(loan.schedule, '2026-02-28', FIXTURE_CURRENCY);

    expect(withFee.minus(withoutFee).equals(money('12.00'))).toBe(true);
  });
});

describe('unpaidPortion', () => {
  it('is never negative on an overpaid instalment', () => {
    const [row] = aLoan().schedule;
    if (!row) throw new Error('The fixture produced an empty schedule');

    const overpaid = { ...row, paidAmount: toStored(money('99999.00')) };
    expect(unpaidPortion(overpaid).isZero).toBe(true);
  });
});

describe('isLateFeeCharged', () => {
  it('reads the fee off the instalment rather than recomputing a date', () => {
    const [row] = aLoan().schedule;
    if (!row) throw new Error('The fixture produced an empty schedule');

    expect(isLateFeeCharged(row)).toBe(false);
    expect(isLateFeeCharged({ ...row, fees: toStored(money('12.00')) })).toBe(true);
  });
});
