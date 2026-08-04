import { EntryType, PostingDirection } from '@reliance/contracts';

import { fromStored } from '../../../common/money/money.codec.js';
import { GL, movementEntries } from '../../../domain/ledger/index.js';
import { gbp } from '../../accounts/__tests__/accounts-harness.js';

import {
  interestRig,
  seedInterestAccount,
  TIERED_SAVINGS_TIERS,
  type InterestRig,
} from './interest-harness.js';

/**
 * The acceptance fixture: 365 simulated days on a tiered savings account, asserted
 * against figures computed by hand from the published rules — not from this
 * implementation's own arithmetic.
 *
 * ## The scenario
 *
 * A saver holds £6,000.00 from 2026-01-01 in a product paying 1% up to £1,000,
 * 1.5% to £5,000 and 2% above — marginally, so £6,000 earns £1,000×1% + £4,000×1.5% +
 * £1,000×2% = £90.00 a year, actual/365. Interest accrues daily without rounding and is
 * capitalised on the first of each month, value-dated to the month just ended; the
 * capitalised interest itself starts earning (monthly compounding). On 2026-07-01 the
 * saver withdraws £5,500.00, dropping the balance — now roughly £544 — entirely into
 * the 1% band for the remaining 184 days.
 *
 * ## The hand computation
 *
 * One day on balance B accrues exactly `Σ band-slice × band-bps / 3,650,000` pence.
 * Each capitalisation pays the whole-pence floor of the accumulator and carries the
 * sub-pence remainder forward. Applying that by hand, month by month (2026 is not a
 * leap year):
 *
 * | period | payout | | period | payout |
 * |--------|-------:| |--------|-------:|
 * | 2026-01 | 764p | | 2026-07 | 46p |
 * | 2026-02 | 691p | | 2026-08 | 47p |
 * | 2026-03 | 767p | | 2026-09 | 44p |
 * | 2026-04 | 744p | | 2026-10 | 47p |
 * | 2026-05 | 769p | | 2026-11 | 45p |
 * | 2026-06 | 746p | | 2026-12 | 46p |
 *
 * Totalling £47.56 for the year and a closing balance of £547.56, with a carried
 * remainder of 2,589,200 numerator units (0.709… pence) still unpaid on New Year's Day.
 */

const PRODUCT = 'TIERED_SAVINGS';
const VERSION = 1;

const OPENING_MINOR = 600_000;
const WITHDRAWAL_MINOR = 550_000;
const WITHDRAWAL_DATE = '2026-07-01';
const DAYS_IN_YEAR = 365;
const MS_PER_DAY = 86_400_000;
const YEAR_START_MS = Date.UTC(2026, 0, 1);
const NOON_HOURS = 12;

/** The hand-computed payout for each capitalisation period, in pence. */
const EXPECTED_MONTHLY: Readonly<Record<string, number>> = {
  '2026-01': 764,
  '2026-02': 691,
  '2026-03': 767,
  '2026-04': 744,
  '2026-05': 769,
  '2026-06': 746,
  '2026-07': 46,
  '2026-08': 47,
  '2026-09': 44,
  '2026-10': 47,
  '2026-11': 45,
  '2026-12': 46,
};

const EXPECTED_TOTAL_MINOR = 4_756;
const EXPECTED_FINAL_BALANCE_MINOR = 54_756;
const EXPECTED_REMAINDER_NUMERATOR = 2_589_200n;

/** Every ISO date of 2026, New Year's Day first. */
function yearOfDates(): string[] {
  return Array.from({ length: DAYS_IN_YEAR }, (_, day) =>
    new Date(YEAR_START_MS + day * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

/** The `YYYY-MM` before the one an ISO date falls in. */
function priorPeriod(isoDate: string): string {
  const [year = 0, month = 0] = isoDate.slice(0, 7).split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** Funds the fixture and withdraws mid-year, both through the real ledger. */
async function applyMovement(rig: InterestRig, accountId: string, isoDate: string): Promise<void> {
  if (isoDate === WITHDRAWAL_DATE) {
    await rig.ledger.postings.post(
      movementEntries.outboundTransfer({
        reference: 'FIXTURE-WITHDRAWAL',
        fromAccountId: accountId,
        amount: gbp(WITHDRAWAL_MINOR),
        fee: gbp(0),
        type: EntryType.DOMESTIC_TRANSFER,
        description: 'Savings withdrawal',
        valueDate: isoDate,
        bookedAt: rig.clock.now(),
      }),
    );
  }
}

/** Runs one simulated day: movement, then month-end capitalisation, then accrual. */
async function runDay(rig: InterestRig, accountId: string, isoDate: string): Promise<void> {
  rig.clock.freezeAt(new Date(`${isoDate}T${NOON_HOURS}:00:00.000Z`));
  await applyMovement(rig, accountId, isoDate);

  if (isoDate.endsWith('-01') && isoDate !== '2026-01-01') {
    await rig.capitalisation.runMonthlyCapitalisation(priorPeriod(isoDate));
  }

  const accrual = await rig.accrual.runDailyAccrual(isoDate);
  expect(accrual).toMatchObject({ scanned: 1, accrued: 1, failed: 0 });
}

describe('the tiered year fixture', () => {
  let rig: InterestRig;
  let accountId: string;

  beforeEach(async () => {
    rig = interestRig(new Date('2026-01-01T12:00:00.000Z'));
    rig.terms.register(PRODUCT, VERSION, TIERED_SAVINGS_TIERS);
    accountId = await seedInterestAccount(rig, {
      interestRateBps: 100,
      productCode: PRODUCT,
      productVersion: VERSION,
    });

    await rig.ledger.postings.post(
      movementEntries.simulatedFunding({
        reference: 'FIXTURE-FUNDING',
        accountId,
        amount: gbp(OPENING_MINOR),
        description: 'Opening deposit',
        valueDate: '2026-01-01',
        bookedAt: rig.clock.now(),
      }),
    );

    for (const isoDate of yearOfDates()) {
      await runDay(rig, accountId, isoDate);
    }

    // New Year's Day: December capitalises, exactly as every other month did.
    rig.clock.freezeAt(new Date('2027-01-01T12:00:00.000Z'));
    await rig.capitalisation.runMonthlyCapitalisation('2026-12');
  });

  it('pays exactly the hand-computed amount every month', async () => {
    for (const [period, expected] of Object.entries(EXPECTED_MONTHLY)) {
      const entry = await rig.ledger.entries.findByReference(`INT-${accountId}-CAP-${period}`);
      expect(entry).not.toBeNull();

      const credit = entry?.postings.find((p) => p.direction === PostingDirection.CREDIT);
      expect(credit?.amount.amount).toBe(String(expected));
    }
  });

  it('pays exactly the hand-computed total for the year', async () => {
    const state = await rig.states.findByAccountId(accountId);
    expect(state && fromStored(state.capitalisedToDate).equals(gbp(EXPECTED_TOTAL_MINOR))).toBe(
      true,
    );
    expect(state?.numerator).toBe(EXPECTED_REMAINDER_NUMERATOR);
  });

  it('leaves the account at the hand-computed closing balance', async () => {
    const account = await rig.accounts.findById(accountId);
    expect(
      account && fromStored(account.ledgerBalance).equals(gbp(EXPECTED_FINAL_BALANCE_MINOR)),
    ).toBe(true);
  });

  it('books the interest as expense to the bank and deposits to the customer, balanced', async () => {
    const expense = await rig.ledger.glAccounts.findByCode(GL.INTEREST_EXPENSE);
    expect(expense?.balances['GBP']?.amount).toBe(String(EXPECTED_TOTAL_MINOR));

    const deposits = await rig.ledger.glAccounts.findByCode(GL.CUSTOMER_DEPOSITS);
    expect(deposits?.balances['GBP']?.amount).toBe(String(EXPECTED_FINAL_BALANCE_MINOR));

    const entries = await rig.ledger.entries.findSince(new Date(0));
    expect(entries).toHaveLength(14);
    for (const entry of entries) {
      expect(debitsOf(entry)).toBe(creditsOf(entry));
    }
  });

  it('replays the whole year as a no-op', async () => {
    for (const isoDate of yearOfDates()) {
      const accrual = await rig.accrual.runDailyAccrual(isoDate);
      expect(accrual.alreadyAccrued).toBe(1);
    }
    for (const period of Object.keys(EXPECTED_MONTHLY)) {
      const rerun = await rig.capitalisation.runMonthlyCapitalisation(period);
      expect(rerun).toMatchObject({ capitalised: 0, skipped: 1 });
    }

    const entries = await rig.ledger.entries.findSince(new Date(0));
    expect(entries).toHaveLength(14);
  });
});

function debitsOf(entry: {
  postings: readonly { direction: string; amount: { amount: string } }[];
}): bigint {
  return sumOf(entry, PostingDirection.DEBIT);
}

function creditsOf(entry: {
  postings: readonly { direction: string; amount: { amount: string } }[];
}): bigint {
  return sumOf(entry, PostingDirection.CREDIT);
}

function sumOf(
  entry: { postings: readonly { direction: string; amount: { amount: string } }[] },
  direction: string,
): bigint {
  return entry.postings
    .filter((posting) => posting.direction === direction)
    .reduce((total, posting) => total + BigInt(posting.amount.amount), 0n);
}
