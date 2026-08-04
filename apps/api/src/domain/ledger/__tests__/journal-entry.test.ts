import { EntryType, JournalEntryStatus, PostingDirection } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { GL } from '../chart-of-accounts.js';
import { EntryBuilder } from '../entry-builder.js';
import { JournalEntry } from '../journal-entry.js';
import { EmptyEntryError, UnbalancedEntryError } from '../ledger.errors.js';
import { Posting } from '../posting.js';

const BOOKED_AT = new Date('2026-03-01T10:00:00.000Z');
const VALUE_DATE = '2026-03-01';
const gbp = (major: string) => Money.fromMajor(major, 'GBP');
const usd = (major: string) => Money.fromMajor(major, 'USD');

function baseInput(postings: Posting[]) {
  return {
    reference: 'JNL-0001',
    type: EntryType.INTERNAL_TRANSFER,
    description: 'Test entry',
    valueDate: VALUE_DATE,
    bookedAt: BOOKED_AT,
    postings,
  };
}

describe('the balance invariant', () => {
  it('accepts an entry whose debits equal its credits', () => {
    const entry = JournalEntry.create(
      baseInput([
        Posting.debit({
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          accountId: 'acc_a',
          amount: gbp('100.00'),
          narrative: 'out',
        }),
        Posting.credit({
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          accountId: 'acc_b',
          amount: gbp('100.00'),
          narrative: 'in',
        }),
      ]),
    );

    expect(entry.totalDebits('GBP').equals(entry.totalCredits('GBP'))).toBe(true);
    expect(entry.status).toBe(JournalEntryStatus.POSTED);
  });

  it('refuses to construct an entry that does not balance', () => {
    expect(() =>
      JournalEntry.create(
        baseInput([
          Posting.debit({
            ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
            accountId: 'acc_a',
            amount: gbp('100.00'),
            narrative: 'out',
          }),
          Posting.credit({
            ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
            accountId: 'acc_b',
            amount: gbp('99.99'),
            narrative: 'in',
          }),
        ]),
      ),
    ).toThrow(UnbalancedEntryError);
  });

  it('refuses an entry with fewer than two postings', () => {
    expect(() =>
      JournalEntry.create(
        baseInput([
          Posting.debit({
            ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
            accountId: 'acc_a',
            amount: gbp('1.00'),
            narrative: 'lonely',
          }),
        ]),
      ),
    ).toThrow(EmptyEntryError);

    expect(() => JournalEntry.create(baseInput([]))).toThrow(EmptyEntryError);
  });

  it('balances each currency independently, so GBP cannot offset USD', () => {
    const postings = [
      Posting.debit({
        ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
        accountId: 'acc_a',
        amount: gbp('100.00'),
        narrative: 'sell',
      }),
      Posting.credit({
        ledgerAccountCode: GL.NOSTRO_CLEARING,
        amount: usd('127.00'),
        narrative: 'buy',
      }),
    ];

    // Each currency is unbalanced on its own even though "two postings" exist.
    expect(() => JournalEntry.create(baseInput(postings))).toThrow(UnbalancedEntryError);
  });

  it('accepts a cross-currency entry that balances twice', () => {
    const entry = JournalEntry.create(
      baseInput([
        Posting.debit({
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          accountId: 'acc_gbp',
          amount: gbp('100.00'),
          narrative: 'sell GBP',
        }),
        Posting.credit({
          ledgerAccountCode: GL.NOSTRO_CLEARING,
          amount: gbp('100.00'),
          narrative: 'FX position GBP',
        }),
        Posting.debit({
          ledgerAccountCode: GL.NOSTRO_CLEARING,
          amount: usd('127.00'),
          narrative: 'FX position USD',
        }),
        Posting.credit({
          ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
          accountId: 'acc_usd',
          amount: usd('127.00'),
          narrative: 'buy USD',
        }),
      ]),
    );

    expect(entry.currencies.sort()).toEqual(['GBP', 'USD']);
    expect(entry.totalDebits('GBP').toMajorString()).toBe('100.00');
    expect(entry.totalDebits('USD').toMajorString()).toBe('127.00');
  });
});

describe('effect on balances', () => {
  const entry = JournalEntry.create(
    baseInput([
      Posting.debit({
        ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
        accountId: 'acc_payer',
        amount: gbp('250.00'),
        narrative: 'out',
      }),
      Posting.credit({
        ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
        accountId: 'acc_payee',
        amount: gbp('250.00'),
        narrative: 'in',
      }),
    ]),
  );

  it('debits reduce and credits increase a customer balance', () => {
    expect(entry.netEffectOn('acc_payer', 'GBP').toMajorString()).toBe('-250.00');
    expect(entry.netEffectOn('acc_payee', 'GBP').toMajorString()).toBe('250.00');
  });

  it('reports zero for an account it does not touch', () => {
    expect(entry.netEffectOn('acc_stranger', 'GBP').isZero).toBe(true);
  });

  it('lists every affected account exactly once', () => {
    expect(entry.affectedAccountIds.sort()).toEqual(['acc_payee', 'acc_payer']);
    expect(entry.postingsFor('acc_payer')).toHaveLength(1);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.postings)).toBe(true);
  });
});

describe('reversal', () => {
  const original = EntryBuilder.for({
    reference: 'JNL-ORIG',
    type: EntryType.FEE,
    description: 'Monthly maintenance fee',
    valueDate: VALUE_DATE,
    bookedAt: BOOKED_AT,
  })
    .debitCustomer('acc_a', gbp('5.00'), 'Fee')
    .creditLedger(GL.FEE_INCOME, gbp('5.00'), 'Fee income')
    .build();

  const reversal = original.buildReversal({
    reference: 'JNL-REV',
    reversesEntryId: 'jnl_original',
    reason: 'Charged in error',
    valueDate: VALUE_DATE,
    bookedAt: BOOKED_AT,
  });

  it('flips every posting and still balances', () => {
    expect(reversal.postings).toHaveLength(original.postings.length);
    expect(reversal.totalDebits('GBP').equals(reversal.totalCredits('GBP'))).toBe(true);
  });

  it('undoes the original effect exactly', () => {
    const net = original.netEffectOn('acc_a', 'GBP').plus(reversal.netEffectOn('acc_a', 'GBP'));
    expect(net.isZero).toBe(true);
  });

  it('records what it reverses and why, rather than editing history', () => {
    expect(reversal.reversesEntryId).toBe('jnl_original');
    expect(reversal.description).toContain('Charged in error');
    expect(reversal.metadata['reversalReason']).toBe('Charged in error');
    // The original is untouched.
    expect(original.reversesEntryId).toBeNull();
  });

  it('preserves direction semantics per posting', () => {
    const [firstOriginal] = original.postings;
    const [firstReversal] = reversal.postings;
    expect(firstOriginal?.direction).toBe(PostingDirection.DEBIT);
    expect(firstReversal?.direction).toBe(PostingDirection.CREDIT);
  });
});
