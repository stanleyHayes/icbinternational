import { PostingDirection, type Posting } from '@reliance/contracts';

import { contraLedgerCode, customerLeg, entryBalance } from './entry-balance';

function posting(overrides: Partial<Posting>): Posting {
  return {
    ledgerAccountCode: '1000',
    ledgerAccountName: 'Cash at central bank',
    accountId: null,
    direction: PostingDirection.DEBIT,
    amount: { amount: '10000', currency: 'GBP' },
    narrative: 'Test posting',
    ...overrides,
  };
}

describe('entryBalance', () => {
  it('totals each side separately rather than netting them', () => {
    const balance = entryBalance([
      posting({ direction: PostingDirection.DEBIT, amount: { amount: '430000', currency: 'GBP' } }),
      posting({
        direction: PostingDirection.CREDIT,
        amount: { amount: '430000', currency: 'GBP' },
      }),
    ]);

    expect(balance.debits).toBe('430000');
    expect(balance.credits).toBe('430000');
    expect(balance.difference).toBe('0');
    expect(balance.balanced).toBe(true);
  });

  it('reports an unbalanced entry rather than silently rounding it', () => {
    const balance = entryBalance([
      posting({ direction: PostingDirection.DEBIT, amount: { amount: '430001', currency: 'GBP' } }),
      posting({
        direction: PostingDirection.CREDIT,
        amount: { amount: '430000', currency: 'GBP' },
      }),
    ]);

    expect(balance.difference).toBe('1');
    expect(balance.balanced).toBe(false);
  });

  it('adds amounts beyond the safe integer range without losing precision', () => {
    const beyondDouble = '9007199254740993';
    const balance = entryBalance([
      posting({
        direction: PostingDirection.DEBIT,
        amount: { amount: beyondDouble, currency: 'GBP' },
      }),
      posting({
        direction: PostingDirection.CREDIT,
        amount: { amount: beyondDouble, currency: 'GBP' },
      }),
    ]);

    expect(balance.debits).toBe(beyondDouble);
    expect(balance.balanced).toBe(true);
  });

  it('has no currency when there are no postings', () => {
    expect(entryBalance([]).currency).toBeNull();
  });
});

describe('customerLeg and contraLedgerCode', () => {
  const entry = [
    posting({ accountId: 'acc_01J8ZQ4T7M5N6P7Q8R9S0T1U2V', direction: PostingDirection.DEBIT }),
    posting({ ledgerAccountCode: '2100', accountId: null, direction: PostingDirection.CREDIT }),
  ];

  it('finds the leg that touched a customer account', () => {
    expect(customerLeg(entry)?.accountId).toBe('acc_01J8ZQ4T7M5N6P7Q8R9S0T1U2V');
  });

  it('finds the general-ledger account the opposing leg landed on', () => {
    expect(contraLedgerCode(entry)).toBe('2100');
  });

  it('returns nothing when an entry never touched a customer account', () => {
    expect(customerLeg([posting({})])).toBeNull();
  });
});
