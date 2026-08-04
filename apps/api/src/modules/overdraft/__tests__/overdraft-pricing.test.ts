import { Money } from '@reliance/money';

import {
  assignableLimit,
  dailyInterest,
  roundDownToStep,
  utilisationOf,
} from '../overdraft-pricing.js';
import {
  INTEREST_FREE_BUFFER_MINOR_UNITS,
  LIMIT_GRANULARITY_MINOR_UNITS,
  MAX_AUTOMATED_LIMIT_MINOR_UNITS,
  MINIMUM_FACILITY_SCORE,
} from '../overdraft.constants.js';

/**
 * Overdraft pricing: how much is used, what a day of it costs, and how large a facility
 * the automated path will grant.
 *
 * The sign convention is the thing most likely to be got backwards — the ledger holds an
 * overdrawn balance as negative and everything the customer is shown is positive — so
 * every case here starts from a signed ledger balance rather than an already-flipped one.
 */

const GBP = 'GBP';

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

describe('utilisationOf', () => {
  it('reports nothing used on an account in credit', () => {
    const utilisation = utilisationOf(money('250.00'), money('500.00'));

    expect(utilisation.used.isZero).toBe(true);
    expect(utilisation.headroom.equals(money('500.00'))).toBe(true);
    expect(utilisation.utilisationBps).toBe(0);
  });

  it('flips the ledger sign so the customer sees a positive figure', () => {
    const utilisation = utilisationOf(money('-120.00'), money('500.00'));

    expect(utilisation.used.equals(money('120.00'))).toBe(true);
    expect(utilisation.arranged.equals(money('120.00'))).toBe(true);
    expect(utilisation.unarranged.isZero).toBe(true);
  });

  it('splits the part beyond the arranged limit', () => {
    const utilisation = utilisationOf(money('-620.00'), money('500.00'));

    expect(utilisation.arranged.equals(money('500.00'))).toBe(true);
    expect(utilisation.unarranged.equals(money('120.00'))).toBe(true);
    expect(utilisation.headroom.isZero).toBe(true);
  });

  it('reports utilisation in basis points of the limit', () => {
    expect(utilisationOf(money('-250.00'), money('500.00')).utilisationBps).toBe(5000);
  });

  it('reports nil utilisation rather than dividing by nought with no facility', () => {
    expect(utilisationOf(money('-50.00'), money('0.00')).utilisationBps).toBe(0);
  });
});

describe('dailyInterest', () => {
  it('charges nothing inside the interest-free buffer', () => {
    const buffer = Money.fromMinor(INTEREST_FREE_BUFFER_MINOR_UNITS, GBP);
    const utilisation = utilisationOf(buffer.negate(), money('500.00'));

    expect(dailyInterest(utilisation).isZero).toBe(true);
  });

  it('charges nothing on an account in credit', () => {
    expect(dailyInterest(utilisationOf(money('100.00'), money('500.00'))).isZero).toBe(true);
  });

  it('charges only the balance above the buffer', () => {
    const justOver = dailyInterest(utilisationOf(money('-26.00'), money('500.00')));
    const wellOver = dailyInterest(utilisationOf(money('-500.00'), money('500.00')));

    expect(wellOver.greaterThan(justOver)).toBe(true);
  });

  it('charges a day of the annual rate, actual/365', () => {
    // £1,000 drawn at 39.90% for one day is 1000 × 0.399 / 365 = £1.09.
    const utilisation = utilisationOf(money('-1025.00'), money('2000.00'));

    expect(dailyInterest(utilisation).equals(money('1.09'))).toBe(true);
  });

  it('rounds a fraction of a penny to the customer, never against them', () => {
    const utilisation = utilisationOf(money('-25.01'), money('500.00'));

    expect(dailyInterest(utilisation).isZero).toBe(true);
  });

  it('prices the unarranged part as well as the arranged one', () => {
    const withinLimit = dailyInterest(utilisationOf(money('-500.00'), money('500.00')));
    const overLimit = dailyInterest(utilisationOf(money('-700.00'), money('500.00')));

    expect(overLimit.greaterThan(withinLimit)).toBe(true);
  });
});

describe('roundDownToStep', () => {
  it('rounds a facility down to a tidy figure', () => {
    expect(roundDownToStep(money('473.20'), GBP).equals(money('450.00'))).toBe(true);
  });

  it('leaves an amount already on a step alone', () => {
    const onStep = Money.fromMinor(LIMIT_GRANULARITY_MINOR_UNITS * 4n, GBP);

    expect(roundDownToStep(onStep, GBP).equals(onStep)).toBe(true);
  });

  it('is nil for a negative amount rather than rounding away from zero', () => {
    expect(roundDownToStep(money('-100.00'), GBP).isZero).toBe(true);
  });
});

describe('assignableLimit', () => {
  const request = {
    monthlyIncome: money('3000.00'),
    creditScore: 700,
    requested: money('2000.00'),
  };

  it('grants half of monthly income, rounded to a step', () => {
    expect(assignableLimit(request).equals(money('1500.00'))).toBe(true);
  });

  it('never grants more than was asked for', () => {
    const modest = assignableLimit({ ...request, requested: money('250.00') });

    expect(modest.equals(money('250.00'))).toBe(true);
  });

  it('never grants more than the automated ceiling', () => {
    const wealthy = assignableLimit({
      monthlyIncome: money('20000.00'),
      creditScore: 800,
      requested: money('15000.00'),
    });
    const ceiling = Money.fromMinor(MAX_AUTOMATED_LIMIT_MINOR_UNITS, GBP);

    expect(wealthy.equals(ceiling)).toBe(true);
  });

  it('grants nothing below the minimum score', () => {
    const weak = assignableLimit({ ...request, creditScore: MINIMUM_FACILITY_SCORE - 1 });

    expect(weak.isZero).toBe(true);
  });

  it('grants at the minimum score, so the boundary is inclusive', () => {
    const boundary = assignableLimit({ ...request, creditScore: MINIMUM_FACILITY_SCORE });

    expect(boundary.isPositive).toBe(true);
  });
});
