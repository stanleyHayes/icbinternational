import {
  EntryType,
  JournalEntryStatus,
  PostingDirection,
  SpendCategory,
  TransactionDirection,
  TransactionStatus,
} from '@reliance/contracts';

import { toStored } from '../../../common/money/money.codec.js';
import { ENTRY_METADATA_KEY } from '../transactions.constants.js';

import {
  ACCOUNT_ID,
  buildProjector,
  entry,
  gbp,
  postings,
  USER_ID,
} from './transaction-test.helpers.js';

describe('TransactionProjectorService', () => {
  it('projects one row per customer account touched by the entry', async () => {
    const { projector } = buildProjector();

    const rows = await projector.project(entry());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      direction: TransactionDirection.DEBIT,
      status: TransactionStatus.COMPLETED,
      type: EntryType.CARD_PURCHASE,
    });
  });

  it('stores the amount as a magnitude with the sign in the direction', async () => {
    const { projector } = buildProjector();

    const [debit] = await projector.project(entry());
    const [credit] = await projector.project(
      entry({
        id: 'jnl_01JQ8Z00000000000000000002',
        postings: postings({
          accountId: ACCOUNT_ID,
          amount: gbp(500),
          direction: PostingDirection.CREDIT,
        }),
      }),
    );

    expect(debit?.amount.amount).toBe('1250');
    expect(debit?.direction).toBe(TransactionDirection.DEBIT);
    expect(credit?.amount.amount).toBe('500');
    expect(credit?.direction).toBe(TransactionDirection.CREDIT);
  });

  describe('idempotency', () => {
    it('returns the existing row rather than duplicating on replay', async () => {
      const { projector, store } = buildProjector();
      const original = entry();

      const first = await projector.project(original);
      const second = await projector.project(original);
      const third = await projector.project(original);

      expect(second[0]?.id).toBe(first[0]?.id);
      expect(third[0]?.id).toBe(first[0]?.id);

      const page = await store.list({ userId: USER_ID, limit: 10 });
      expect(page.data).toHaveLength(1);
    });

    it('does not re-derive the running balance on a replay', async () => {
      const { projector, balances } = buildProjector(gbp(100_000));
      const original = entry();

      const [first] = await projector.project(original);

      // The account moves on, as it would while the customer keeps spending.
      balances.injectDrift(ACCOUNT_ID, gbp(-50_000));
      const [replayed] = await projector.project(original);

      expect(replayed?.runningBalance.amount).toBe(first?.runningBalance.amount);
    });

    it('recovers the winner when a concurrent projection wins the race', async () => {
      const { projector, store } = buildProjector();
      const original = entry();

      // Simulate losing the read-before-write race: the row appears between the check and
      // the insert, so the store rejects with the unique index's duplicate-key error.
      const winner = await store.insert({
        accountId: ACCOUNT_ID,
        journalEntryId: original.id,
        userId: USER_ID,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.COMPLETED,
        type: EntryType.CARD_PURCHASE,
        amount: toStored(gbp(1250)),
        runningBalance: toStored(gbp(98_750)),
        originalAmount: null,
        exchangeRate: null,
        description: 'Card purchase',
        reference: 'REF-1',
        category: SpendCategory.SHOPPING,
        counterparty: null,
        bookedAt: original.bookedAt,
        completedAt: original.bookedAt,
      });

      const [row] = await projector.project(original);
      expect(row?.id).toBe(winner.id);
    });
  });

  describe('running balance', () => {
    it('matches the account balance immediately after each posting', async () => {
      const { projector, balances } = buildProjector(gbp(100_000));

      const amounts = [1250, 4000, 375];
      const observed: string[] = [];

      for (const [index, minor] of amounts.entries()) {
        // Mirrors what PostingService does: move the balance, then project.
        balances.injectDrift(ACCOUNT_ID, gbp(-minor));
        const [projected] = await projector.project(
          entry({
            id: `jnl_${String(index).padStart(26, '0')}`,
            postings: postings({
              accountId: ACCOUNT_ID,
              amount: gbp(minor),
              direction: PostingDirection.DEBIT,
            }),
          }),
        );
        observed.push(projected?.runningBalance.amount ?? '');
        expect(projected?.runningBalance.amount).toBe(
          balances.balanceOf(ACCOUNT_ID).amount.toString(),
        );
      }

      expect(observed).toEqual(['98750', '94750', '94375']);
    });
  });

  describe('enrichment', () => {
    it('lifts the counterparty out of the entry metadata', async () => {
      const { projector } = buildProjector();

      const [row] = await projector.project(
        entry({
          metadata: {
            [ENTRY_METADATA_KEY.counterpartyName]: 'Pret A Manger',
            [ENTRY_METADATA_KEY.mcc]: '5814',
            [ENTRY_METADATA_KEY.merchantId]: 'mrc_123',
            [ENTRY_METADATA_KEY.counterpartyCountry]: 'GB',
          },
        }),
      );

      expect(row?.counterparty).toMatchObject({
        name: 'Pret A Manger',
        mcc: '5814',
        merchantId: 'mrc_123',
        country: 'GB',
      });
      expect(row?.category).toBe(SpendCategory.DINING);
    });

    it('drops a cross-currency pair that is only half present', async () => {
      const { projector } = buildProjector();

      const [row] = await projector.project(
        entry({ metadata: { [ENTRY_METADATA_KEY.originalAmount]: '1499' } }),
      );

      expect(row?.originalAmount).toBeNull();
      expect(row?.exchangeRate).toBeNull();
    });

    it('keeps a complete cross-currency pair', async () => {
      const { projector } = buildProjector();

      const [row] = await projector.project(
        entry({
          metadata: {
            [ENTRY_METADATA_KEY.originalAmount]: '1499',
            [ENTRY_METADATA_KEY.originalCurrency]: 'USD',
            [ENTRY_METADATA_KEY.exchangeRate]: '0.8339',
          },
        }),
      );

      expect(row?.originalAmount).toEqual({ amount: '1499', currency: 'USD' });
      expect(row?.exchangeRate).toBe('0.8339');
    });
  });

  it('nets two legs on the same account into one row', async () => {
    const { projector } = buildProjector();
    const purchase = postings({
      accountId: ACCOUNT_ID,
      amount: gbp(1000),
      direction: PostingDirection.DEBIT,
    });
    const fee = postings({
      accountId: ACCOUNT_ID,
      amount: gbp(250),
      direction: PostingDirection.DEBIT,
    });

    const rows = await projector.project(entry({ postings: [...purchase, ...fee] }));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount.amount).toBe('1250');
  });

  it('marks a reversed entry as reversed with no completion time', async () => {
    const { projector } = buildProjector();

    const [row] = await projector.project(entry({ status: JournalEntryStatus.REVERSED }));

    expect(row?.status).toBe(TransactionStatus.REVERSED);
    expect(row?.completedAt).toBeNull();
  });

  it('skips an account with no owner rather than aborting the posting', async () => {
    const { projector, owners } = buildProjector();
    owners.reset();

    await expect(projector.project(entry())).resolves.toEqual([]);
  });
});
