import { PostingDirection, type InterestTier } from '@reliance/contracts';

import { fromStored } from '../../../common/money/money.codec.js';
import { GL } from '../../../domain/ledger/index.js';
import { gbp } from '../../accounts/__tests__/accounts-harness.js';
import { ACCRUAL_DENOMINATOR } from '../day-count.js';

import { interestRig, seedInterestAccount, type InterestRig } from './interest-harness.js';

/**
 * The engine over real services: daily accrual onto exact accumulators, monthly
 * capitalisation booking genuine journal entries through a real `PostingService`.
 *
 * Fixture account: £1,000.00 in a single-band product at 1% — £10.00 a year, so one day
 * accrues exactly 10,000,000 numerator units (100,000 minor × 100 bps) and the hand
 * arithmetic stays readable.
 */

const PRODUCT = 'TIERED_SAVINGS';
const VERSION = 1;
const OPENING_BALANCE = 100_000;
const DAILY_UNITS = 10_000_000n;

const TIERS: InterestTier[] = [
  { fromAmount: { amount: '0', currency: 'GBP' }, toAmount: null, annualRateBps: 100 },
];

/** ISO dates for the first `count` days of a month, e.g. february(3) → 02-01…02-03. */
function daysOf(month: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
}

async function accrueDays(rig: InterestRig, dates: string[]): Promise<void> {
  for (const date of dates) {
    await rig.accrual.runDailyAccrual(date);
  }
}

function seedSavingAccount(rig: InterestRig): Promise<string> {
  return seedInterestAccount(rig, {
    ledger: gbp(OPENING_BALANCE),
    interestRateBps: 100,
    productCode: PRODUCT,
    productVersion: VERSION,
  });
}

describe('daily accrual', () => {
  let rig: InterestRig;

  beforeEach(() => {
    rig = interestRig(new Date('2026-03-15T12:00:00.000Z'));
    rig.terms.register(PRODUCT, VERSION, TIERS);
  });

  it('accrues one exact day onto every interest-bearing account', async () => {
    const accountId = await seedSavingAccount(rig);

    const result = await rig.accrual.runDailyAccrual();

    expect(result).toMatchObject({ asOf: '2026-03-15', scanned: 1, accrued: 1 });
    const state = await rig.states.findByAccountId(accountId);
    expect(state?.numerator).toBe(DAILY_UNITS);
    expect(state?.lastAccruedOn).toBe('2026-03-15');
  });

  it('turns a rerun of the same date into a no-op', async () => {
    const accountId = await seedSavingAccount(rig);
    await rig.accrual.runDailyAccrual('2026-03-15');

    const rerun = await rig.accrual.runDailyAccrual('2026-03-15');

    expect(rerun).toMatchObject({ accrued: 0, alreadyAccrued: 1 });
    expect((await rig.states.findByAccountId(accountId))?.numerator).toBe(DAILY_UNITS);
  });

  it('accrues nothing for an account whose product pays nothing', async () => {
    const accountId = await seedInterestAccount(rig, {
      ledger: gbp(OPENING_BALANCE),
      interestRateBps: 100,
      productCode: 'PAYS_NOTHING',
      productVersion: VERSION,
    });

    const result = await rig.accrual.runDailyAccrual();

    expect(result).toMatchObject({ accrued: 0, withoutTerms: 1 });
    expect(await rig.states.findByAccountId(accountId)).toBeNull();
  });

  it('reports earned-but-unpaid interest truncated exactly as capitalisation will pay it', async () => {
    const accountId = await seedSavingAccount(rig);
    await accrueDays(rig, daysOf('2026-03', 3));

    // Three days on £1,000 at 1% is 8.219… pence — reported as the whole 8.
    const accrued = await rig.accrual.accruedToDate(accountId);
    expect(accrued?.equals(gbp(8))).toBe(true);
  });
});

describe('monthly capitalisation', () => {
  let rig: InterestRig;
  let accountId: string;

  beforeEach(async () => {
    rig = interestRig(new Date('2026-03-01T06:00:00.000Z'));
    rig.terms.register(PRODUCT, VERSION, TIERS);
    accountId = await seedSavingAccount(rig);
    await accrueDays(rig, daysOf('2026-02', 28));
  });

  it('posts a real, balanced journal entry for the month', async () => {
    const result = await rig.capitalisation.runMonthlyCapitalisation('2026-02');

    // 28 days on £1,000 at 1% is 76.71… pence: 76 paid, the fraction carried.
    expect(result).toMatchObject({ period: '2026-02', scanned: 1, capitalised: 1 });

    const entry = await rig.ledger.entries.findByReference(`INT-${accountId}-CAP-2026-02`);
    expect(entry).not.toBeNull();
    expect(entry?.valueDate).toBe('2026-02-28');

    const debits = entry?.postings.filter((p) => p.direction === PostingDirection.DEBIT) ?? [];
    const credits = entry?.postings.filter((p) => p.direction === PostingDirection.CREDIT) ?? [];
    expect(debits.map((p) => p.amount.amount)).toEqual(['76']);
    expect(credits.map((p) => p.amount.amount)).toEqual(['76']);
    expect(debits[0]?.ledgerAccountCode).toBe(GL.INTEREST_EXPENSE);
    expect(credits[0]?.accountId).toBe(accountId);
  });

  it('credits the customer and expenses the bank by the same amount', async () => {
    await rig.capitalisation.runMonthlyCapitalisation('2026-02');

    const account = await rig.accounts.findById(accountId);
    expect(account && fromStored(account.ledgerBalance).equals(gbp(OPENING_BALANCE + 76))).toBe(
      true,
    );

    const expense = await rig.ledger.glAccounts.findByCode(GL.INTEREST_EXPENSE);
    expect(expense?.balances['GBP']?.amount).toBe('76');
  });

  it('carries the sub-minor remainder into the next period', async () => {
    await rig.capitalisation.runMonthlyCapitalisation('2026-02');

    const state = await rig.states.findByAccountId(accountId);
    expect(state?.lastCapitalisedPeriod).toBe('2026-02');
    expect(state?.numerator).toBe(28n * DAILY_UNITS - 76n * ACCRUAL_DENOMINATOR);
    expect(state && fromStored(state.capitalisedToDate).equals(gbp(76))).toBe(true);
  });

  it('turns a rerun of the same period into a no-op with no second entry', async () => {
    await rig.capitalisation.runMonthlyCapitalisation('2026-02');

    const rerun = await rig.capitalisation.runMonthlyCapitalisation('2026-02');

    expect(rerun).toMatchObject({ capitalised: 0, skipped: 1 });
    const entries = await rig.ledger.entries.findSince(new Date(0));
    expect(entries).toHaveLength(1);
  });

  it('pays the cumulative exact amount across consecutive months, drift-free', async () => {
    await rig.capitalisation.runMonthlyCapitalisation('2026-02');
    await accrueDays(rig, daysOf('2026-03', 31));
    await rig.capitalisation.runMonthlyCapitalisation('2026-03');

    // 59 days exact: 59 × £10/365 = £1.6150… → £1.61 across the two months.
    // February paid 76p; March pays the rest, 85p — not 84p, because the carried
    // fraction from February is earned into it.
    const march = await rig.ledger.entries.findByReference(`INT-${accountId}-CAP-2026-03`);
    expect(march?.postings[0]?.amount.amount).toBe('85');

    const state = await rig.states.findByAccountId(accountId);
    expect(state && fromStored(state.capitalisedToDate).equals(gbp(161))).toBe(true);
  });

  it('settles a period that earned a fraction without posting an entry', async () => {
    const tinyId = await seedInterestAccount(rig, {
      ledger: gbp(1_000),
      interestRateBps: 100,
      productCode: PRODUCT,
      productVersion: VERSION,
    });
    await rig.accrual.runDailyAccrual('2026-02-01');

    // One day on £10 at 1% is 0.027 pence: nothing to post, but the fraction carries.
    const paid = await rig.capitalisation.capitaliseOne(tinyId, '2026-02');

    expect(paid?.amount?.isZero).toBe(true);
    expect(await rig.ledger.entries.findByReference(`INT-${tinyId}-CAP-2026-02`)).toBeNull();
    const state = await rig.states.findByAccountId(tinyId);
    expect(state?.lastCapitalisedPeriod).toBe('2026-02');
    expect(state?.numerator).toBe(100_000n);
  });
});
