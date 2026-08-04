import { Money } from '@reliance/money';

import { GL } from '../chart-of-accounts.js';
import { type JournalEntry } from '../journal-entry.js';
import { entries } from '../recipes/index.js';

const BOOKED_AT = new Date('2026-03-15T09:30:00.000Z');
const VALUE_DATE = '2026-03-15';
const gbp = (major: string) => Money.fromMajor(major, 'GBP');
const usd = (major: string) => Money.fromMajor(major, 'USD');

const common = { valueDate: VALUE_DATE, bookedAt: BOOKED_AT };

/** Every recipe must produce an entry that balances in every currency it touches. */
function expectBalanced(entry: JournalEntry): void {
  for (const currency of entry.currencies) {
    expect(entry.totalDebits(currency).equals(entry.totalCredits(currency))).toBe(true);
  }
}

describe('movement recipes', () => {
  it('internalTransfer leaves total customer liability unchanged', () => {
    const entry = entries.internalTransfer({
      ...common,
      reference: 'T1',
      fromAccountId: 'acc_a',
      toAccountId: 'acc_b',
      amount: gbp('75.00'),
      description: 'Rent',
    });

    expectBalanced(entry);
    const net = entry.netEffectOn('acc_a', 'GBP').plus(entry.netEffectOn('acc_b', 'GBP'));
    expect(net.isZero).toBe(true);
  });

  it('outboundTransfer parks the amount in flight and books the fee as income', () => {
    const entry = entries.outboundTransfer({
      ...common,
      reference: 'T2',
      fromAccountId: 'acc_a',
      amount: gbp('500.00'),
      fee: gbp('2.50'),
      type: 'DOMESTIC_TRANSFER',
      description: 'Supplier payment',
    });

    expectBalanced(entry);
    expect(entry.netEffectOn('acc_a', 'GBP').toMajorString()).toBe('-502.50');
    expect(codesIn(entry)).toContain(GL.UNSETTLED_OUTBOUND);
    expect(codesIn(entry)).toContain(GL.FEE_INCOME);
  });

  it('outboundTransfer omits the fee legs when there is no fee', () => {
    const entry = entries.outboundTransfer({
      ...common,
      reference: 'T3',
      fromAccountId: 'acc_a',
      amount: gbp('500.00'),
      fee: gbp('0.00'),
      type: 'DOMESTIC_TRANSFER',
      description: 'Free transfer',
    });

    expectBalanced(entry);
    expect(entry.postings).toHaveLength(2);
    expect(codesIn(entry)).not.toContain(GL.FEE_INCOME);
  });

  it('settleOutbound clears the in-flight liability against the nostro', () => {
    const entry = entries.settleOutbound({
      ...common,
      reference: 'T4',
      amount: gbp('500.00'),
      description: 'ACH batch 42',
    });

    expectBalanced(entry);
    expect(codesIn(entry).sort()).toEqual([GL.NOSTRO_CLEARING, GL.UNSETTLED_OUTBOUND].sort());
  });

  it('inboundTransfer grows both the nostro and what the bank owes', () => {
    const entry = entries.inboundTransfer({
      ...common,
      reference: 'T5',
      toAccountId: 'acc_a',
      amount: gbp('1200.00'),
      description: 'Salary',
    });

    expectBalanced(entry);
    expect(entry.netEffectOn('acc_a', 'GBP').toMajorString()).toBe('1200.00');
  });

  it('simulatedFunding still draws from the nostro, so the book stays balanced', () => {
    const entry = entries.simulatedFunding({
      ...common,
      reference: 'T6',
      accountId: 'acc_a',
      amount: gbp('10000.00'),
      description: 'Credit transfer received',
    });

    expectBalanced(entry);
    expect(entry.metadata['fundingSource']).toBe('treasury');
    expect(codesIn(entry)).toContain(GL.NOSTRO_CLEARING);
  });
});

describe('product recipes', () => {
  it('fee moves value from the customer to fee income', () => {
    const entry = entries.fee({
      ...common,
      reference: 'F1',
      accountId: 'acc_a',
      amount: gbp('12.00'),
      description: 'Monthly maintenance',
    });

    expectBalanced(entry);
    expect(entry.netEffectOn('acc_a', 'GBP').toMajorString()).toBe('-12.00');
  });

  it('interestCredit is an expense to the bank and a credit to the saver', () => {
    const entry = entries.interestCredit({
      ...common,
      reference: 'I1',
      accountId: 'acc_a',
      amount: gbp('4.17'),
      description: 'Interest for March',
    });

    expectBalanced(entry);
    expect(entry.netEffectOn('acc_a', 'GBP').toMajorString()).toBe('4.17');
    expect(codesIn(entry)).toContain(GL.INTEREST_EXPENSE);
  });

  it('interestDebit is income to the bank and a debit to the borrower', () => {
    const entry = entries.interestDebit({
      ...common,
      reference: 'I2',
      accountId: 'acc_a',
      amount: gbp('9.99'),
      description: 'Overdraft interest',
    });

    expectBalanced(entry);
    expect(entry.netEffectOn('acc_a', 'GBP').toMajorString()).toBe('-9.99');
    expect(codesIn(entry)).toContain(GL.INTEREST_INCOME);
  });

  it('fxConversion balances in both currencies and books the spread as income', () => {
    const entry = entries.fxConversion({
      ...common,
      reference: 'X1',
      fromAccountId: 'acc_gbp',
      toAccountId: 'acc_usd',
      sellAmount: gbp('100.00'),
      buyAmount: usd('126.68'),
      spread: usd('0.32'),
      description: 'GBP → USD',
    });

    expectBalanced(entry);
    expect(entry.currencies.sort()).toEqual(['GBP', 'USD']);
    expect(entry.netEffectOn('acc_gbp', 'GBP').toMajorString()).toBe('-100.00');
    expect(entry.netEffectOn('acc_usd', 'USD').toMajorString()).toBe('126.68');
    expect(codesIn(entry)).toContain(GL.FX_SPREAD_INCOME);
  });

  it('fxConversion with a zero spread omits the income leg but still balances', () => {
    const entry = entries.fxConversion({
      ...common,
      reference: 'X2',
      fromAccountId: 'acc_gbp',
      toAccountId: 'acc_usd',
      sellAmount: gbp('100.00'),
      buyAmount: usd('127.00'),
      spread: usd('0.00'),
      description: 'GBP → USD at mid',
    });

    expectBalanced(entry);
    expect(codesIn(entry)).not.toContain(GL.FX_SPREAD_INCOME);
  });

  it('cardPurchase owes the network what the customer spent', () => {
    const entry = entries.cardPurchase({
      ...common,
      reference: 'C1',
      accountId: 'acc_a',
      amount: gbp('42.10'),
      description: 'Coffee Republic',
    });

    expectBalanced(entry);
    expect(codesIn(entry)).toContain(GL.CARD_NETWORK_SETTLEMENT);
  });

  it('loanDisbursement creates an asset and funds the customer', () => {
    const entry = entries.loanDisbursement({
      ...common,
      reference: 'L1',
      accountId: 'acc_a',
      amount: gbp('5000.00'),
      description: 'Personal loan drawdown',
    });

    expectBalanced(entry);
    expect(entry.netEffectOn('acc_a', 'GBP').toMajorString()).toBe('5000.00');
    expect(codesIn(entry)).toContain(GL.LOANS_RECEIVABLE);
  });

  it('loanRepayment splits principal from interest', () => {
    const entry = entries.loanRepayment({
      ...common,
      reference: 'L2',
      accountId: 'acc_a',
      principal: gbp('180.00'),
      interest: gbp('20.00'),
      description: 'Instalment 3',
    });

    expectBalanced(entry);
    expect(entry.netEffectOn('acc_a', 'GBP').toMajorString()).toBe('-200.00');
    expect(codesIn(entry)).toEqual(
      expect.arrayContaining([GL.LOANS_RECEIVABLE, GL.INTEREST_INCOME]),
    );
  });

  it('loanRepayment of interest only omits the principal leg', () => {
    const entry = entries.loanRepayment({
      ...common,
      reference: 'L3',
      accountId: 'acc_a',
      principal: gbp('0.00'),
      interest: gbp('20.00'),
      description: 'Interest-only payment',
    });

    expectBalanced(entry);
    expect(codesIn(entry)).not.toContain(GL.LOANS_RECEIVABLE);
  });

  it('depositPlacement moves the balance from on-demand to term', () => {
    const entry = entries.depositPlacement({
      ...common,
      reference: 'D1',
      accountId: 'acc_a',
      amount: gbp('10000.00'),
      description: '12-month fixed deposit',
    });

    expectBalanced(entry);
    expect(codesIn(entry)).toContain(GL.TERM_DEPOSITS);
  });
});

function codesIn(entry: JournalEntry): string[] {
  return entry.postings.map((posting) => posting.ledgerAccountCode);
}
