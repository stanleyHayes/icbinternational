import { LedgerAccountType, PostingDirection } from '@reliance/contracts';
import { Money, sumMoney, type CurrencyCode } from '@reliance/money';

import { CHART_OF_ACCOUNTS, debitIncreases, findGlAccount, GL } from '../chart-of-accounts.js';
import { type JournalEntry } from '../journal-entry.js';
import {
  ControlAccountPostingError,
  NonPositivePostingError,
  UnknownLedgerAccountError,
} from '../ledger.errors.js';
import { Posting } from '../posting.js';
import { entries } from '../recipes/index.js';

const BOOKED_AT = new Date('2026-03-15T09:30:00.000Z');
const VALUE_DATE = '2026-03-15';
const gbp = (major: string) => Money.fromMajor(major, 'GBP');

const common = { valueDate: VALUE_DATE, bookedAt: BOOKED_AT };

describe('chart of accounts', () => {
  it('has unique codes', () => {
    const codes = CHART_OF_ACCOUNTS.map((account) => account.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('resolves a known code and rejects an unknown one', () => {
    expect(findGlAccount(GL.FEE_INCOME)?.type).toBe(LedgerAccountType.INCOME);
    expect(findGlAccount('9999')).toBeUndefined();
  });

  it('knows which account types grow on the debit side', () => {
    expect(debitIncreases(LedgerAccountType.ASSET)).toBe(true);
    expect(debitIncreases(LedgerAccountType.EXPENSE)).toBe(true);
    expect(debitIncreases(LedgerAccountType.LIABILITY)).toBe(false);
    expect(debitIncreases(LedgerAccountType.EQUITY)).toBe(false);
    expect(debitIncreases(LedgerAccountType.INCOME)).toBe(false);
  });
});

describe('Posting', () => {
  it('rejects an unknown GL account', () => {
    expect(() =>
      Posting.debit({ ledgerAccountCode: '9999', amount: gbp('1.00'), narrative: 'x' }),
    ).toThrow(UnknownLedgerAccountError);
  });

  it.each([['0.00'], ['-5.00']])('rejects a non-positive amount of %s', (amount) => {
    expect(() =>
      Posting.debit({
        ledgerAccountCode: GL.FEE_INCOME,
        amount: gbp(amount),
        narrative: 'x',
      }),
    ).toThrow(NonPositivePostingError);
  });

  it('applies the account type when reporting its own effect', () => {
    const debitAsset = Posting.debit({
      ledgerAccountCode: GL.NOSTRO_CLEARING,
      amount: gbp('10.00'),
      narrative: 'in',
    });
    const debitLiability = Posting.debit({
      ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
      accountId: 'acc_a',
      amount: gbp('10.00'),
      narrative: 'out',
    });

    expect(debitAsset.effectOnLedgerAccount.toMajorString()).toBe('10.00');
    expect(debitLiability.effectOnLedgerAccount.toMajorString()).toBe('-10.00');
  });

  it('reports the customer-facing effect from the customer’s point of view', () => {
    const credit = Posting.credit({
      ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
      accountId: 'acc_a',
      amount: gbp('10.00'),
      narrative: 'in',
    });
    expect(credit.effectOnCustomerBalance.toMajorString()).toBe('10.00');
    expect(credit.reverse('undo').direction).toBe(PostingDirection.DEBIT);
  });

  it('serialises without exposing internals', () => {
    const posting = Posting.credit({
      ledgerAccountCode: GL.FEE_INCOME,
      amount: gbp('2.50'),
      narrative: 'Fee',
    });
    expect(posting.toJSON()).toEqual({
      ledgerAccountCode: GL.FEE_INCOME,
      ledgerAccountName: 'Fee Income',
      accountId: null,
      direction: PostingDirection.CREDIT,
      amount: { amount: '250', currency: 'GBP' },
      narrative: 'Fee',
    });
  });

  it('is immutable', () => {
    const posting = Posting.debit({
      ledgerAccountCode: GL.SUSPENSE,
      amount: gbp('1.00'),
      narrative: 'x',
    });
    expect(Object.isFrozen(posting)).toBe(true);
  });
});

describe('the trial balance across a day of activity', () => {
  it('sums to zero in every currency', () => {
    const book: JournalEntry[] = [
      entries.simulatedFunding({
        ...common,
        reference: 'S1',
        accountId: 'acc_a',
        amount: gbp('5000.00'),
        description: 'Opening funding',
      }),
      entries.internalTransfer({
        ...common,
        reference: 'S2',
        fromAccountId: 'acc_a',
        toAccountId: 'acc_b',
        amount: gbp('750.00'),
        description: 'Rent',
      }),
      entries.fee({
        ...common,
        reference: 'S3',
        accountId: 'acc_a',
        amount: gbp('3.00'),
        description: 'Fee',
      }),
      entries.cardPurchase({
        ...common,
        reference: 'S4',
        accountId: 'acc_b',
        amount: gbp('19.99'),
        description: 'Groceries',
      }),
      entries.interestCredit({
        ...common,
        reference: 'S5',
        accountId: 'acc_a',
        amount: gbp('1.23'),
        description: 'Interest',
      }),
    ];

    for (const currency of ['GBP'] as CurrencyCode[]) {
      const debits = sumMoney(
        book.map((entry) => entry.totalDebits(currency)),
        currency,
      );
      const credits = sumMoney(
        book.map((entry) => entry.totalCredits(currency)),
        currency,
      );
      expect(debits.equals(credits)).toBe(true);
    }
  });

  it('reproduces each customer balance from the postings alone', () => {
    const book = [
      entries.simulatedFunding({
        ...common,
        reference: 'R1',
        accountId: 'acc_a',
        amount: gbp('1000.00'),
        description: 'Funding',
      }),
      entries.internalTransfer({
        ...common,
        reference: 'R2',
        fromAccountId: 'acc_a',
        toAccountId: 'acc_b',
        amount: gbp('250.00'),
        description: 'Split',
      }),
      entries.fee({
        ...common,
        reference: 'R3',
        accountId: 'acc_a',
        amount: gbp('5.00'),
        description: 'Fee',
      }),
    ];

    const replay = (accountId: string) =>
      sumMoney(
        book.map((entry) => entry.netEffectOn(accountId, 'GBP')),
        'GBP',
      );

    expect(replay('acc_a').toMajorString()).toBe('745.00');
    expect(replay('acc_b').toMajorString()).toBe('250.00');
  });
});

describe('control accounts', () => {
  it('are declared in the chart so the posting service can refuse direct writes', () => {
    expect(findGlAccount(GL.CUSTOMER_DEPOSITS)?.isControlAccount).toBe(true);
    expect(findGlAccount(GL.FEE_INCOME)?.isControlAccount).toBe(false);
    expect(new ControlAccountPostingError(GL.CUSTOMER_DEPOSITS).message).toContain(
      'control account',
    );
  });
});
