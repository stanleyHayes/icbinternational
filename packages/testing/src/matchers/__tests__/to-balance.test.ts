import { PostingDirection } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { aJournalEntry } from '../../builders/journal-entry.builder.js';

function leg(direction: string, amount: bigint, currency: CurrencyCode = 'GBP') {
  return { direction, amount: Money.fromMinor(amount, currency) };
}

describe('toBalance matcher', () => {
  it('passes for a balanced two-leg entry', () => {
    const postings = [leg(PostingDirection.DEBIT, 1_000n), leg(PostingDirection.CREDIT, 1_000n)];

    expect(postings).toBalance();
  });

  it('passes for a built journal entry', () => {
    expect(aJournalEntry().withAmount(42_000n).build()).toBalance();
  });

  it('passes for a cross-currency entry that balances in each currency', () => {
    const postings = [
      leg(PostingDirection.DEBIT, 10_000n, 'GBP'),
      leg(PostingDirection.CREDIT, 10_000n, 'GBP'),
      leg(PostingDirection.DEBIT, 12_500n, 'USD'),
      leg(PostingDirection.CREDIT, 12_500n, 'USD'),
    ];

    expect(postings).toBalance();
  });

  it('fails when debits and credits disagree', () => {
    const postings = [leg(PostingDirection.DEBIT, 1_000n), leg(PostingDirection.CREDIT, 999n)];

    expect(postings).not.toBalance();
  });

  it('fails when one currency balances and another does not', () => {
    const postings = [
      leg(PostingDirection.DEBIT, 100n, 'GBP'),
      leg(PostingDirection.CREDIT, 100n, 'GBP'),
      leg(PostingDirection.DEBIT, 100n, 'USD'),
      leg(PostingDirection.CREDIT, 200n, 'USD'),
    ];

    expect(postings).not.toBalance();
  });

  it('fails cleanly on malformed input', () => {
    expect([]).not.toBalance();
    expect('not postings').not.toBalance();
    expect({ postings: [{ direction: PostingDirection.DEBIT }] }).not.toBalance();
    expect([{ direction: PostingDirection.DEBIT, amount: 'garbage' }]).not.toBalance();
  });

  it('reports the out-of-balance currency in the failure message', () => {
    const postings = [leg(PostingDirection.DEBIT, 100n), leg(PostingDirection.CREDIT, 50n)];

    expect(() => expect(postings).toBalance()).toThrow(/GBP/);
  });
});
