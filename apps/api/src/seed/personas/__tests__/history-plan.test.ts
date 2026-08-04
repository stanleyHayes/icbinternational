import { Money } from '@reliance/money';

import { planHistory, savingsSweepFor } from '../history-plan.js';
import { SUBSCRIPTION, SUBSCRIPTIONS } from '../merchant-directory.js';
import { PERSONAS, type Persona } from '../persona-definitions.js';
import { SeededRandom } from '../seeded-random.js';

const ENDING_AT = new Date('2026-08-01T00:00:00.000Z');

/**
 * Plans with headroom wide enough that the solvency walk drops nothing.
 *
 * The tests below assert on the *shape* of a generated life — ordering, salary days,
 * subscription clamping — and a plan trimmed for affordability would make each of them
 * depend on the persona's balance as well. Affordability has its own describe block.
 */
function planFor(persona: Persona, seed = 'test-seed') {
  return planHistory({
    persona,
    currency: 'GBP',
    endingAt: ENDING_AT,
    random: new SeededRandom(`${seed}:${persona.key}`),
    openingBalance: Money.fromMinor(100_000_000, 'GBP'),
    floor: Money.fromMinor(-100_000_000, 'GBP'),
    sweep: null,
  });
}

function personaBy(key: string): Persona {
  const found = PERSONAS.find((persona) => persona.key === key);
  if (!found) throw new Error(`No persona keyed ${key}`);
  return found;
}

describe('determinism', () => {
  it('produces an identical plan from the same seed', () => {
    const first = planFor(personaBy('salaried'));
    const second = planFor(personaBy('salaried'));

    expect(second).toEqual(first);
  });

  it('produces a different plan from a different seed', () => {
    const first = planFor(personaBy('salaried'), 'seed-a');
    const second = planFor(personaBy('salaried'), 'seed-b');

    // Same shape, different content — otherwise the seed is not being used at all.
    expect(second).not.toEqual(first);
  });
});

describe('shape of a generated life', () => {
  const plan = planFor(personaBy('salaried'));

  it('runs oldest first, because the posting loop moves a clock that cannot rewind', () => {
    const timestamps = plan.map((movement) => movement.at.getTime());
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });

  it('stays inside the requested window', () => {
    const persona = personaBy('salaried');
    const earliest = Math.min(...plan.map((movement) => movement.at.getTime()));
    const monthsBack = (ENDING_AT.getTime() - earliest) / (1000 * 60 * 60 * 24 * 31);

    expect(monthsBack).toBeLessThanOrEqual(persona.historyMonths);
    expect(Math.max(...plan.map((movement) => movement.at.getTime()))).toBeLessThan(
      ENDING_AT.getTime(),
    );
  });

  it('pays a salary once a month, on the persona’s day', () => {
    const persona = personaBy('salaried');
    const salaries = plan.filter((movement) => movement.kind === 'SALARY');

    expect(salaries).toHaveLength(persona.historyMonths);
    for (const salary of salaries) {
      expect(salary.at.getUTCDate()).toBe(persona.salaryDay);
      expect(salary.amount.amount).toBe(BigInt(persona.monthlySalaryMinor));
    }
  });

  it('charges each subscription once a month at exactly the same amount', () => {
    const persona = personaBy('salaried');
    const netflix = plan.filter((movement) => movement.merchantName === SUBSCRIPTION.NETFLIX);
    const expected = SUBSCRIPTIONS.find((s) => s.name === SUBSCRIPTION.NETFLIX);

    expect(netflix).toHaveLength(persona.historyMonths);
    // A varying amount would defeat subscription detection, which is the whole reason
    // these are in the dataset.
    expect(new Set(netflix.map((movement) => movement.amount.amount)).size).toBe(1);
    expect(netflix[0]?.amount.amount).toBe(BigInt(expected?.fixedMinor ?? 0));
  });

  it('spreads spend across more than a handful of merchants', () => {
    const merchants = new Set(
      plan.filter((m) => m.kind === 'PURCHASE').map((movement) => movement.merchantName),
    );
    // A history dominated by one or two merchants makes every category chart a single bar.
    expect(merchants.size).toBeGreaterThan(8);
  });

  it('never plans a fractional amount', () => {
    for (const movement of plan) {
      expect(movement.amount).toBeInstanceOf(Money);
      expect(movement.amount.amount % 1n).toBe(0n);
      expect(movement.amount.isPositive).toBe(true);
    }
  });
});

describe('personas with no regular income', () => {
  it('gives the freelancer irregular invoices instead of a salary', () => {
    const plan = planFor(personaBy('freelancer'));
    const income = plan.filter((movement) => movement.kind === 'SALARY');
    const amounts = new Set(income.map((movement) => movement.amount.amount));

    expect(income.length).toBeGreaterThan(0);
    // Varying amounts on varying days — the point of the archetype.
    expect(amounts.size).toBeGreaterThan(1);
  });

  it('plans nothing at all for a persona with no history', () => {
    expect(planFor(personaBy('newcomer'))).toHaveLength(0);
  });
});

describe('savings sweep', () => {
  it('is a share of salary, and nothing for a persona without one', () => {
    expect(savingsSweepFor(personaBy('salaried'), 'GBP')?.isPositive).toBe(true);
    expect(savingsSweepFor(personaBy('freelancer'), 'GBP')).toBeNull();
  });
});

describe('the persona set covers the awkward cases', () => {
  it('includes an unverified customer, a dormant one and a business', () => {
    const keys = new Set(PERSONAS.map((persona) => persona.key));
    expect(keys).toContain('newcomer');
    expect(keys).toContain('dormant');
    expect(keys).toContain('business');
  });

  it('uses only example.com addresses, so no generated mail can reach a real inbox', () => {
    for (const persona of PERSONAS) {
      expect(persona.email.endsWith('@example.com')).toBe(true);
    }
  });

  it('references only subscriptions the merchant directory actually defines', () => {
    const known = new Set(SUBSCRIPTIONS.map((subscription) => subscription.name));
    for (const persona of PERSONAS) {
      for (const name of persona.subscriptions) expect(known).toContain(name);
    }
  });
});

describe('living within means', () => {
  const student = personaBy('student');

  function planWith(input: { openingMinor: number; floorMinor: number; sweep?: Money | null }) {
    return planHistory({
      persona: student,
      currency: 'GBP',
      endingAt: ENDING_AT,
      random: new SeededRandom(`means:${student.key}`),
      openingBalance: Money.fromMinor(input.openingMinor, 'GBP'),
      floor: Money.fromMinor(input.floorMinor, 'GBP'),
      sweep: input.sweep ?? null,
    });
  }

  /**
   * Replays a plan the way the posting loop does and returns the lowest balance it reaches.
   * This is the property that matters: the ledger rejects the first debit past the floor,
   * so a plan is only postable if every intermediate balance clears it.
   */
  function lowestBalance(plan: ReturnType<typeof planWith>, openingMinor: number): bigint {
    let balance = Money.fromMinor(openingMinor, 'GBP');
    let lowest = balance;

    for (const movement of plan) {
      balance =
        movement.kind === 'SALARY' ? balance.plus(movement.amount) : balance.minus(movement.amount);
      if (balance.lessThan(lowest)) lowest = balance;
    }

    return lowest.amount;
  }

  it('never plans a balance below the floor', () => {
    const plan = planWith({ openingMinor: 21_400, floorMinor: 0 });

    expect(lowestBalance(plan, 21_400)).toBeGreaterThanOrEqual(0n);
  });

  it('spends into an arranged overdraft but not past it', () => {
    const floorMinor = -50_000;
    const plan = planWith({ openingMinor: 21_400, floorMinor });

    expect(lowestBalance(plan, 21_400)).toBeGreaterThanOrEqual(BigInt(floorMinor));
    // The facility has to actually get used, or the assertion above proves nothing.
    expect(lowestBalance(plan, 21_400)).toBeLessThan(0n);
  });

  it('keeps every salary, because income does not depend on the balance it lands in', () => {
    const unconstrained = planWith({ openingMinor: 100_000_000, floorMinor: -100_000_000 });
    const broke = planWith({ openingMinor: 0, floorMinor: 0 });
    const salaries = (plan: ReturnType<typeof planWith>) =>
      plan.filter((movement) => movement.kind === 'SALARY').length;

    expect(salaries(broke)).toBe(salaries(unconstrained));
  });

  it('drops spending a thinner balance cannot cover', () => {
    const comfortable = planWith({ openingMinor: 100_000_000, floorMinor: -100_000_000 });
    const thin = planWith({ openingMinor: 21_400, floorMinor: 0 });

    expect(thin.length).toBeLessThan(comfortable.length);
  });

  it('counts the savings sweep against the balance that funds it', () => {
    const sweep = Money.fromMinor(9_360, 'GBP');
    const plan = planWith({ openingMinor: 21_400, floorMinor: 0, sweep });
    const sweeps = plan.filter((movement) => movement.kind === 'TRANSFER_TO_SAVINGS');

    // One per salary — the sweep follows payday.
    expect(sweeps).toHaveLength(student.historyMonths);
    expect(lowestBalance(plan, 21_400)).toBeGreaterThanOrEqual(0n);
  });

  it('places each sweep no earlier than the salary that pays for it', () => {
    const plan = planWith({
      openingMinor: 21_400,
      floorMinor: 0,
      sweep: Money.fromMinor(9_360, 'GBP'),
    });
    const firstSweep = plan.findIndex((movement) => movement.kind === 'TRANSFER_TO_SAVINGS');
    const firstSalary = plan.findIndex((movement) => movement.kind === 'SALARY');

    expect(firstSalary).toBeLessThan(firstSweep);
  });
});
