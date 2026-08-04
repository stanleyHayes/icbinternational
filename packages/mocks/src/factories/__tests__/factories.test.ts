/**
 * The factories, exercised directly.
 *
 * These are the package's other public surface: a UI lane building a card component
 * imports `makeCard()` rather than standing up the whole bank. That makes the override
 * merge and the per-type branches part of the contract, not an implementation detail.
 */

import { AccountType, LocationKind } from '@reliance/contracts';

import { MockClock } from '../../db/clock.js';
import { minorUnits, money } from '../../db/money.js';
import { reseed } from '../../faker.js';
import { makeAccount, makeBalance, makeStatements, MOCK_PRODUCT_CODES } from '../banking.js';
import { makeArticle, makeCmsPage, makeFaq, makeLocation } from '../engagement.js';
import { makeAddress, makeKycCase, makeUser } from '../identity.js';
import { makeBillers, makeBulkTransfer, makeTransfer } from '../movement.js';
import { makeAdminRoles, makeAuditTrail, makeSnapshot } from '../operations.js';
import {
  makeCard,
  makeCardControls,
  makeDeposit,
  makeDepositRates,
  makeFxRates,
  makeGoal,
  makeLoan,
  makeLoanProducts,
  makeSchedule,
} from '../products.js';

const clock = new MockClock();
const USER_ID = 'usr_01JQ8ZKX9M2NPQR3STVWXYZ456';
const ACCOUNT_ID = 'acc_01JQ8ZKX9M2NPQR3STVWXYZ456';

beforeEach(() => {
  reseed();
  clock.reset();
});

describe('overrides', () => {
  it('win over every generated field', () => {
    const user = makeUser({ clock, overrides: { firstName: 'Ada', status: 'LOCKED' } });

    expect(user.firstName).toBe('Ada');
    expect(user.status).toBe('LOCKED');
  });

  it('leave the rest of the shape intact', () => {
    const user = makeUser({ clock, overrides: { firstName: 'Ada' } });
    expect(user.lastName.length).toBeGreaterThan(0);
  });
});

describe('makeBalance', () => {
  it('derives available from ledger, holds and overdraft', () => {
    const balance = makeBalance({
      clock,
      ledgerMinor: 100_000n,
      heldMinor: 25_000n,
      overdraftMinor: 50_000n,
    });

    expect(minorUnits(balance.available)).toBe(125_000n);
  });

  it('defaults holds and overdraft to nothing', () => {
    const balance = makeBalance({ clock, ledgerMinor: 100n });
    expect(minorUnits(balance.available)).toBe(100n);
  });
});

describe('makeAccount', () => {
  it.each([
    [AccountType.CURRENT, MOCK_PRODUCT_CODES.CURRENT, 'GBP'],
    [AccountType.SAVINGS, MOCK_PRODUCT_CODES.SAVINGS, 'GBP'],
    [AccountType.BUSINESS, MOCK_PRODUCT_CODES.BUSINESS, 'GBP'],
    [AccountType.FX_WALLET, MOCK_PRODUCT_CODES.FX_WALLET, 'EUR'],
  ])('maps %s to its product and currency', (type, productCode, currency) => {
    const account = makeAccount({ clock, userId: USER_ID, type });

    expect(account.productCode).toBe(productCode);
    expect(account.currency).toBe(currency);
  });

  it('defaults to a current account', () => {
    expect(makeAccount({ clock, userId: USER_ID }).type).toBe(AccountType.CURRENT);
  });

  it('pays interest on savings and nothing on current', () => {
    expect(
      makeAccount({ clock, userId: USER_ID, type: AccountType.SAVINGS }).interestRateBps,
    ).toBeGreaterThan(0);
    expect(makeAccount({ clock, userId: USER_ID }).interestRateBps).toBeNull();
  });

  it('produces a contract-shaped IBAN, number and sort code', () => {
    const account = makeAccount({ clock, userId: USER_ID });

    expect(account.number).toMatch(/^\d{10}$/);
    expect(account.sortCode).toMatch(/^\d{6}$/);
    expect(account.iban).toMatch(/^GB\d{2}RLNC\d{14}$/);
  });
});

describe('statements', () => {
  it('produces one per month, newest first, with a footing balance', () => {
    const account = makeAccount({ clock, userId: USER_ID });
    const statements = makeStatements({ clock, account, count: 3 });

    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      const expected =
        minorUnits(statement.openingBalance) +
        minorUnits(statement.totalCredits) -
        minorUnits(statement.totalDebits);
      expect(minorUnits(statement.closingBalance)).toBe(expected);
    }
  });
});

describe('makeSchedule', () => {
  it('amortises to exactly zero', () => {
    const schedule = makeSchedule({
      clock,
      principalMinor: 1_000_000n,
      aprBps: 899,
      termMonths: 24,
    });

    expect(schedule).toHaveLength(24);
    expect(minorUnits(schedule.at(-1)?.closingBalance ?? money(1))).toBe(0n);
  });

  it('repays exactly the principal across every instalment', () => {
    const principal = 1_000_003n;
    const schedule = makeSchedule({ clock, principalMinor: principal, aprBps: 750, termMonths: 7 });
    const repaid = schedule.reduce((sum, row) => sum + minorUnits(row.principal), 0n);

    expect(repaid).toBe(principal);
  });

  it('marks instalments already paid', () => {
    const schedule = makeSchedule({
      clock,
      principalMinor: 500_000n,
      aprBps: 500,
      termMonths: 12,
      paidInstalments: 4,
    });

    expect(schedule.filter((row) => row.status === 'PAID')).toHaveLength(4);
    expect(schedule[0]?.paidAt).not.toBeNull();
    expect(schedule.at(-1)?.paidAt).toBeNull();
  });
});

describe('products', () => {
  it('issues a card whose expiry is in the future', () => {
    const card = makeCard({ clock, accountId: ACCOUNT_ID, cardholderName: 'Ada Lovelace' });

    expect(card.expiresAt > clock.nowIso()).toBe(true);
    expect(card.last4).toMatch(/^\d{4}$/);
  });

  it('starts a card with permissive controls that overrides can tighten', () => {
    const controls = makeCardControls({ onlinePayments: false, blockedMccs: ['7995'] });

    expect(controls.onlinePayments).toBe(false);
    expect(controls.contactless).toBe(true);
    expect(controls.blockedMccs).toEqual(['7995']);
  });

  it('keeps goal progress consistent with its amounts', () => {
    const goal = makeGoal({ clock, linkedAccountId: ACCOUNT_ID });
    const expected = Number(
      (minorUnits(goal.currentAmount) * 10_000n) / minorUnits(goal.targetAmount),
    );

    expect(goal.progressBps).toBe(expected);
  });

  it('makes a deposit whose maturity value is principal plus projected interest', () => {
    const deposit = makeDeposit({ clock, sourceAccountId: ACCOUNT_ID });
    const expected = minorUnits(deposit.principal) + minorUnits(deposit.projectedInterest);

    expect(minorUnits(deposit.maturityValue)).toBe(expected);
  });

  it('offers a deposit rate board that rises with the term', () => {
    const rates = makeDepositRates();
    for (let index = 1; index < rates.length; index += 1) {
      expect(rates[index]?.annualRateBps).toBeGreaterThanOrEqual(
        rates[index - 1]?.annualRateBps ?? 0,
      );
    }
  });

  it('makes a loan whose instalment counts add up to the term', () => {
    const product = makeLoanProducts()[0];
    if (!product) throw new Error('no loan products');
    const loan = makeLoan({ clock, applicationId: 'app-1', product });

    expect(loan.instalmentsPaid + loan.instalmentsRemaining).toBe(loan.termMonths);
  });

  it('quotes FX with the bid below the mid and the ask above it', () => {
    for (const rate of makeFxRates(clock)) {
      expect(Number(rate.bid)).toBeLessThan(Number(rate.mid));
      expect(Number(rate.ask)).toBeGreaterThan(Number(rate.mid));
    }
  });
});

describe('movement', () => {
  it('settles a transfer with a complete timeline', () => {
    const transfer = makeTransfer({ clock, sourceAccountId: ACCOUNT_ID });

    expect(transfer.status).toBe('SETTLED');
    expect(transfer.timeline.length).toBeGreaterThanOrEqual(3);
  });

  it('totals a bulk file to the sum of its rows', () => {
    const batch = makeBulkTransfer({ clock, sourceAccountId: ACCOUNT_ID, rowCount: 5 });
    const summed = batch.rows.reduce((sum, row) => sum + minorUnits(row.amount), 0n);

    expect(batch.rows).toHaveLength(5);
    expect(minorUnits(batch.totalAmount)).toBe(summed);
  });

  it('offers a stable biller directory', () => {
    expect(makeBillers().map((biller) => biller.name)).toEqual(
      makeBillers().map((biller) => biller.name),
    );
  });
});

describe('content', () => {
  it('builds a page with SEO and ordered blocks', () => {
    const page = makeCmsPage({ clock, slug: 'savings', title: 'Savings' });

    expect(page.slug).toBe('savings');
    expect(page.seo.title).toContain('Savings');
    expect(page.blocks.length).toBeGreaterThan(0);
  });

  it('slugs an article title', () => {
    expect(makeArticle({ clock }).slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('wraps around the FAQ seed rather than running out', () => {
    expect(makeFaq({ index: 99 }).question.length).toBeGreaterThan(0);
  });

  it('closes ATMs on Sunday and gives branches deposit machines', () => {
    const atm = makeLocation({ overrides: { kind: LocationKind.ATM } });
    const branch = makeLocation({ overrides: { kind: LocationKind.BRANCH } });

    expect(atm.hasDepositMachine).toBe(false);
    expect(branch.hasDepositMachine).toBe(true);
    expect(atm.openingHours.find((day) => day.day === 'SUN')?.opens).toBeNull();
  });
});

describe('operations', () => {
  it('chains the audit trail so each event links to the last', () => {
    const events = makeAuditTrail({ clock, count: 6 });

    expect(events[0]?.previousHash).toBe('genesis');
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index]?.previousHash).toBe(events[index - 1]?.hash);
    }
  });

  it('numbers audit events from one, without gaps', () => {
    const events = makeAuditTrail({ clock, count: 4 });
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('gives every role at least one permission', () => {
    for (const definition of makeAdminRoles()) {
      expect(definition.permissions.length).toBeGreaterThan(0);
    }
  });

  it('labels a snapshot and dates it from the clock', () => {
    const snapshot = makeSnapshot({ clock, label: 'Before payday' });

    expect(snapshot.label).toBe('Before payday');
    expect(snapshot.createdAt).toBe(clock.nowIso());
  });
});

describe('identity', () => {
  it('builds a UK address with a plausible postcode', () => {
    expect(makeAddress().postalCode).toMatch(/^[A-Z]{2}\d{1,2} \d[A-Z]{2}$/);
    expect(makeAddress({ country: 'IE' }).country).toBe('IE');
  });

  it('approves a KYC case with documents attached', () => {
    const kycCase = makeKycCase({ clock, userId: USER_ID });

    expect(kycCase.status).toBe('APPROVED');
    expect(kycCase.documents.length).toBeGreaterThan(0);
    expect(kycCase.nextStep).toBeNull();
  });
});
