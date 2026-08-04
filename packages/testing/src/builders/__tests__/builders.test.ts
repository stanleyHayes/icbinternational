import {
  AccountStatus,
  AccountType,
  accountSchema,
  balanceSchema,
  journalEntrySchema,
  userSchema,
} from '@reliance/contracts';

import { anAccount } from '../account.builder.js';
import { aBalance } from '../balance.builder.js';
import { aJournalEntry } from '../journal-entry.builder.js';
import { aMoney } from '../money.builder.js';
import { testId } from '../test-id.js';
import { aUser } from '../user.builder.js';

describe('testId', () => {
  it('produces prefixed ULIDs the contract pattern accepts', () => {
    expect(testId('acc')).toMatch(/^acc_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('never repeats', () => {
    expect(testId('usr')).not.toBe(testId('usr'));
  });
});

describe('aMoney', () => {
  it('builds a Money with deterministic defaults', () => {
    const money = aMoney().build();

    expect(money.amount).toBe(125_000n);
    expect(money.currency).toBe('GBP');
  });

  it('builds the wire shape', () => {
    expect(aMoney().withMajor('10.00').buildJSON()).toEqual({ amount: '1000', currency: 'GBP' });
  });

  it('honours overrides', () => {
    expect(aMoney().withMinor(7n).withCurrency('USD').buildJSON()).toEqual({
      amount: '7',
      currency: 'USD',
    });
  });
});

describe('aBalance', () => {
  it('keeps available = ledger − held + overdraft', () => {
    const balance = aBalance().withLedger(100_000n).withHeld(25_000n).build();

    expect(balance.available).toEqualMoney({ amount: '75000', currency: 'GBP' });
    expect(balanceSchema.parse(balance)).toEqual(balance);
  });
});

describe('aUser', () => {
  it('produces schema-valid users with deterministic person data', () => {
    const first = aUser().build();
    const second = aUser().build();

    expect(userSchema.parse(first)).toEqual(first);
    expect(first.email).toBe(second.email);
    expect(first.id).not.toBe(second.id);
  });

  it('honours overrides', () => {
    const user = aUser().withEmail('ada@example.com').withName('Ada', 'Lovelace').build();

    expect(user.email).toBe('ada@example.com');
    expect(user.firstName).toBe('Ada');
    expect(user.lastName).toBe('Lovelace');
  });
});

describe('anAccount', () => {
  it('produces a schema-valid active current account by default', () => {
    const account = anAccount().build();

    expect(accountSchema.parse(account)).toEqual(account);
    expect(account.status).toBe(AccountStatus.ACTIVE);
    expect(account.type).toBe(AccountType.CURRENT);
  });

  it('links the holder to the owning user', () => {
    const user = aUser().build();
    const account = anAccount().withUserId(user.id).build();

    expect(account.userId).toBe(user.id);
    expect(account.holderIds).toEqual([user.id]);
  });

  it('marks closed accounts with a closure timestamp', () => {
    const account = anAccount().withStatus(AccountStatus.CLOSED).build();

    expect(account.closedAt).not.toBeNull();
  });
});

describe('aJournalEntry', () => {
  it('produces a schema-valid entry that balances by construction', () => {
    const entry = aJournalEntry().withAmount(50_000n).build();

    expect(journalEntrySchema.parse(entry)).toEqual(entry);
    expect(entry).toBalance();
    expect(entry.postings).toHaveLength(2);
  });

  it('routes the credit leg to the customer account', () => {
    const accountId = testId('acc');
    const entry = aJournalEntry().withAccountId(accountId).build();

    expect(entry.postings[1]?.accountId).toBe(accountId);
  });
});

describe('buildMany', () => {
  it('builds distinct objects', () => {
    const users = aUser().buildMany(3);

    expect(users).toHaveLength(3);
    expect(new Set(users.map((user) => user.id)).size).toBe(3);
    expect(new Set(users.map((user) => user.email)).size).toBe(3);
  });
});

describe('builder overrides', () => {
  it('aUser honours every override', () => {
    const id = testId('usr');
    const user = aUser()
      .withId(id)
      .withStatus('PENDING_VERIFICATION')
      .withSegment('BUSINESS')
      .withBaseCurrency('USD')
      .build();

    expect(user.id).toBe(id);
    expect(user.emailVerified).toBe(false);
    expect(user.segment).toBe('BUSINESS');
    expect(user.baseCurrency).toBe('USD');
  });

  it('anAccount honours every override', () => {
    const id = testId('acc');
    const balance = aBalance().withLedger(0n).build();
    const account = anAccount()
      .withId(id)
      .withType(AccountType.SAVINGS)
      .withCurrency('EUR')
      .withNickname('Holiday fund')
      .withBalance(balance)
      .build();

    expect(account.id).toBe(id);
    expect(account.type).toBe(AccountType.SAVINGS);
    expect(account.currency).toBe('EUR');
    expect(account.nickname).toBe('Holiday fund');
    expect(account.interestRateBps).toBe(150);
    expect(account.balance.ledger).toEqualMoney({ amount: '0', currency: 'GBP' });
  });

  it('aJournalEntry honours every override', () => {
    const id = testId('jnl');
    const entry = aJournalEntry()
      .withId(id)
      .withReference('Custom reference')
      .withStatus('PENDING')
      .withDebitAccount('1100', 'Card Network Settlement')
      .withCreditAccount('2100', 'Unsettled Inbound')
      .withAccountId(null)
      .build();

    expect(entry.id).toBe(id);
    expect(entry.reference).toBe('Custom reference');
    expect(entry.status).toBe('PENDING');
    expect(entry.postings[0]?.ledgerAccountCode).toBe('1100');
    expect(entry.postings[1]?.ledgerAccountCode).toBe('2100');
    expect(entry.postings[1]?.accountId).toBeNull();
    expect(entry).toBalance();
  });

  it('aMoney builds zero', () => {
    expect(aMoney().zero().build()).toEqualMoney({ amount: '0', currency: 'GBP' });
  });
});

describe('matcher failure messages', () => {
  it('toEqualMoney has a negated message', () => {
    const money = aMoney().withMinor(100n).build();

    expect(() => expect(money).not.toEqualMoney({ amount: '100', currency: 'GBP' })).toThrow(
      /not to equal money/,
    );
  });

  it('toBalance has a negated message', () => {
    const entry = aJournalEntry().build();

    expect(() => expect(entry).not.toBalance()).toThrow(/not to balance/);
  });
});
