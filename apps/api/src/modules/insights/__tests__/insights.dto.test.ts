import { CashflowGranularity } from '../cashflow-buckets.js';
import { cashflowQuerySchema, spendQuerySchema, subscriptionQuerySchema } from '../insights.dto.js';

const ACCOUNT_ID = 'acc_01JQ8Z00000000000000000001';
const FROM = '2026-03-01T00:00:00.000Z';
const TO = '2026-03-31T23:59:59.000Z';

describe('insights query schemas', () => {
  describe('spend', () => {
    it('accepts a window with an optional account', () => {
      expect(spendQuerySchema.safeParse({ currency: 'GBP', from: FROM, to: TO }).success).toBe(
        true,
      );
      expect(
        spendQuerySchema.safeParse({ accountId: ACCOUNT_ID, currency: 'GBP', from: FROM, to: TO })
          .success,
      ).toBe(true);
    });

    it('rejects an inverted range rather than answering "you spent nothing"', () => {
      const result = spendQuerySchema.safeParse({ currency: 'GBP', from: TO, to: FROM });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['from']);
    });

    it('rejects a currency the bank does not hold', () => {
      expect(spendQuerySchema.safeParse({ currency: 'XYZ', from: FROM, to: TO }).success).toBe(
        false,
      );
    });
  });

  describe('cashflow', () => {
    it('requires an account, because a closing balance belongs to one', () => {
      expect(cashflowQuerySchema.safeParse({ currency: 'GBP', from: FROM, to: TO }).success).toBe(
        false,
      );
    });

    it('defaults to monthly buckets', () => {
      const parsed = cashflowQuerySchema.parse({
        accountId: ACCOUNT_ID,
        currency: 'GBP',
        from: FROM,
        to: TO,
      });

      expect(parsed.granularity).toBe(CashflowGranularity.MONTH);
    });

    it('accepts each granularity the chart supports', () => {
      for (const granularity of Object.values(CashflowGranularity)) {
        const parsed = cashflowQuerySchema.parse({
          accountId: ACCOUNT_ID,
          currency: 'GBP',
          from: FROM,
          to: TO,
          granularity,
        });
        expect(parsed.granularity).toBe(granularity);
      }
    });
  });

  describe('subscriptions', () => {
    it('takes no arguments at all, so the default lookback applies', () => {
      expect(subscriptionQuerySchema.safeParse({}).success).toBe(true);
    });

    it('rejects an id that is not an account', () => {
      expect(subscriptionQuerySchema.safeParse({ accountId: 'usr_x' }).success).toBe(false);
    });
  });
});
