import { type Money } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { type AccountRecord } from '../account.store.js';
import { computeAvailability, coversSpend } from '../availability.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';

import { gbp, seedAccount } from './accounts-harness.js';

/**
 * The availability arithmetic, exercised as a table.
 *
 * Every row is a real situation a customer can be in, including the three that are easy
 * to get wrong: an account already inside its overdraft, an account pushed past it, and
 * an account whose entire balance is under a hold.
 */
describe('computeAvailability', () => {
  const cases: ReadonlyArray<{
    situation: string;
    ledger: string;
    held: string;
    overdraft: string;
    available: string;
    overdraftAvailable: string;
  }> = [
    {
      situation: 'plain credit balance, no facility',
      ledger: '120000',
      held: '0',
      overdraft: '0',
      available: '120000',
      overdraftAvailable: '0',
    },
    {
      situation: 'a hold reduces what can be spent',
      ledger: '120000',
      held: '45000',
      overdraft: '0',
      available: '75000',
      overdraftAvailable: '0',
    },
    {
      situation: 'an unused facility adds headroom on top of the balance',
      ledger: '120000',
      held: '0',
      overdraft: '50000',
      available: '170000',
      overdraftAvailable: '50000',
    },
    {
      situation: 'holds and a facility together',
      ledger: '120000',
      held: '45000',
      overdraft: '50000',
      available: '125000',
      overdraftAvailable: '50000',
    },
    {
      situation: 'already inside the overdraft',
      ledger: '-2000',
      held: '0',
      overdraft: '5000',
      available: '3000',
      overdraftAvailable: '3000',
    },
    {
      situation: 'a hold pushes the account into its facility',
      ledger: '1000',
      held: '3000',
      overdraft: '5000',
      available: '3000',
      overdraftAvailable: '3000',
    },
    {
      situation: 'beyond the facility — nothing is spendable, and it never reads negative',
      ledger: '-8000',
      held: '0',
      overdraft: '5000',
      available: '0',
      overdraftAvailable: '0',
    },
    {
      situation: 'the whole balance is held',
      ledger: '7500',
      held: '7500',
      overdraft: '0',
      available: '0',
      overdraftAvailable: '0',
    },
  ];

  it.each(cases)('$situation', ({ ledger, held, overdraft, available, overdraftAvailable }) => {
    const snapshot = computeAvailability(
      recordWith({ ledger: gbp(ledger), held: gbp(held), overdraft: gbp(overdraft) }),
    );

    expect(snapshot.available.amount.toString()).toBe(available);
    expect(snapshot.overdraftAvailable.amount.toString()).toBe(overdraftAvailable);
    expect(snapshot.net.equals(gbp(ledger).minus(gbp(held)))).toBe(true);
  });

  it('never reports more unused facility than the facility itself', () => {
    const snapshot = computeAvailability(
      recordWith({ ledger: gbp('1000000'), held: gbp('0'), overdraft: gbp('5000') }),
    );

    expect(snapshot.overdraftAvailable.equals(gbp('5000'))).toBe(true);
  });

  it('answers coversSpend at the exact boundary', () => {
    const account = recordWith({ ledger: gbp('5000'), held: gbp('0'), overdraft: gbp('0') });

    expect(coversSpend(account, gbp('5000'))).toBe(true);
    expect(coversSpend(account, gbp('5001'))).toBe(false);
  });
});

describe('the stored availableBalance invariant', () => {
  it('holds for a freshly seeded account', async () => {
    const accounts = new InMemoryAccountStore();
    const accountId = await seedAccount(accounts, { ledger: gbp('9000'), held: gbp('2500') });
    const account = await accounts.findById(accountId);

    // `availableBalance` is a stored denormalisation of `ledgerBalance − holdTotal`, and
    // it deliberately excludes the overdraft facility, which is applied at read time.
    expect(account?.availableBalance.amount).toBe('6500');
    expect(computeAvailability(account as AccountRecord).net.amount.toString()).toBe('6500');
  });
});

/** A minimal record carrying only the three fields the arithmetic reads. */
function recordWith(balances: { ledger: Money; held: Money; overdraft: Money }): AccountRecord {
  return {
    currency: 'GBP',
    ledgerBalance: toStored(balances.ledger),
    holdTotal: toStored(balances.held),
    overdraftLimit: toStored(balances.overdraft),
    availableBalance: toStored(balances.ledger.minus(balances.held)),
  } as AccountRecord;
}
