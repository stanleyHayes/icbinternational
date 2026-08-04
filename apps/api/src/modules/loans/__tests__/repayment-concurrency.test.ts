import { EntryType, type EntryType as JournalEntryType } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { fromStored, toStored, toWire } from '../../../common/money/money.codec.js';
import {
  frozenClock,
  gbp,
  ledgerRigFor,
  retryingRunner,
  seedAccount,
  TEST_USER,
  type LedgerRig,
} from '../../accounts/__tests__/accounts-harness.js';
import { AccountService, InMemoryAccountStore } from '../../accounts/index.js';
import { InMemoryLoanStore } from '../in-memory-loan.store.js';
import { LoanLedgerService } from '../loan-ledger.service.js';
import { LoanRepaymentService } from '../loan-repayment.service.js';
import { LoanServicingService } from '../loan-servicing.service.js';
import { type LoanRecord } from '../loan.store.js';

import { aLoan } from './loan-fixtures.js';

/**
 * Two repayments of different amounts, at the same instant, against one loan.
 *
 * This is the defect that made the suite necessary. A repayment's ledger reference was
 * `LOAN-<loanId>-RPY-<date>.<repaymentCount + 1>` — every component of which two
 * concurrent callers read identically, because both read the same `repaymentCount`. The
 * ledger dedupes on reference and hands back the entry it already holds, so the second
 * payment was never booked; but the loan write-down that followed it committed anyway, and
 * it was an unconditional write, so it also erased the first payment's. The customer was
 * debited once, their loan shrank by the other amount, and the two never had to agree.
 *
 * The assertions are therefore about the two things that had come apart:
 *
 * 1. **Two payments, two journal entries, two references.** One entry means a movement was
 *    silently discarded.
 * 2. **The loan fell by exactly their sum.** Not by one of them, not by more.
 *
 * Nothing here is a mock of the mechanism under test. `PostingService` is the real one over
 * the real chart of accounts, so the reference dedupe is genuine; `MongoAccountBalancePort`
 * is the real adapter, so the ledger's own overdraw floor is in force; and the in-memory
 * loan store performs its conditional write with no `await` between the read and the write,
 * exactly as `findOneAndUpdate` does. The concurrency is real too — `Promise.all` over the
 * public `repay`, not an assertion that a guard exists somewhere.
 */

/** Before the first instalment falls due, so every penny collected is principal. */
const BUSINESS_DATE = new Date('2026-01-20T09:00:00.000Z');

/** Comfortably covers both repayments, so the funds check is not what is under test. */
const OPENING_BALANCE_MINOR = '5000000';

const FIRST_PAYMENT_MINOR = '10000';
const SECOND_PAYMENT_MINOR = '25000';

const REPAYMENT_ENTRY: JournalEntryType = EntryType.LOAN_REPAYMENT;

interface Rig {
  readonly repayments: LoanRepaymentService;
  readonly loans: InMemoryLoanStore;
  readonly accounts: InMemoryAccountStore;
  readonly ledger: LedgerRig;
  readonly accountId: string;
  readonly loan: LoanRecord;
}

async function rig(overrides: { openingMinor?: string } = {}): Promise<Rig> {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock(BUSINESS_DATE);
  const runner = retryingRunner();
  const ledgerRig = ledgerRigFor(accounts, clock, runner);

  const accountId = await seedAccount(accounts, {
    ledger: gbp(overrides.openingMinor ?? OPENING_BALANCE_MINOR),
  });

  const loans = new InMemoryLoanStore(new IdGenerator());
  const loan = await loans.insert(aLoan({ userId: TEST_USER, disbursementAccountId: accountId }));

  const loanLedger = new LoanLedgerService(ledgerRig.postings, clock);
  const repayments = new LoanRepaymentService(
    loans,
    new AccountService(accounts, clock, runner),
    loanLedger,
    new LoanServicingService(loans, loanLedger),
    runner,
  );

  return { repayments, loans, accounts, ledger: ledgerRig, accountId, loan };
}

function repayment(rigged: Rig, minor: string): Promise<unknown> {
  return rigged.repayments.repay({
    userId: TEST_USER,
    loanId: rigged.loan.id,
    request: {
      fromAccountId: rigged.accountId,
      amount: toWire(gbp(minor)),
      overpaymentEffect: 'REDUCE_TERM',
    },
  });
}

/** Every repayment entry the ledger actually holds, in the order it booked them. */
async function repaymentEntries(rigged: Rig): Promise<{ reference: string }[]> {
  const all = await rigged.ledger.entries.findSince(new Date(0));
  return all.filter((entry) => entry.type === REPAYMENT_ENTRY);
}

describe('two concurrent repayments of different amounts', () => {
  it('books one journal entry per payment, under references that differ', async () => {
    const rigged = await rig();

    await Promise.all([
      repayment(rigged, FIRST_PAYMENT_MINOR),
      repayment(rigged, SECOND_PAYMENT_MINOR),
    ]);

    const entries = await repaymentEntries(rigged);
    const references = new Set(entries.map((entry) => entry.reference));

    expect(entries).toHaveLength(2);
    expect(references.size).toBe(2);
  });

  it('reduces the loan by exactly the sum of the two payments', async () => {
    const rigged = await rig();
    const before = fromStored(rigged.loan.outstandingPrincipal);

    await Promise.all([
      repayment(rigged, FIRST_PAYMENT_MINOR),
      repayment(rigged, SECOND_PAYMENT_MINOR),
    ]);

    const after = await rigged.loans.findById(rigged.loan.id);
    const collected = gbp(FIRST_PAYMENT_MINOR).plus(gbp(SECOND_PAYMENT_MINOR));
    const outstanding = after ? fromStored(after.outstandingPrincipal) : before;

    expect(outstanding.equals(before.minus(collected))).toBe(true);
  });

  it('counts both collections, so neither write was lost on top of the other', async () => {
    const rigged = await rig();

    await Promise.all([
      repayment(rigged, FIRST_PAYMENT_MINOR),
      repayment(rigged, SECOND_PAYMENT_MINOR),
    ]);

    expect((await rigged.loans.findById(rigged.loan.id))?.repaymentCount).toBe(2);
  });

  it('stamps the loan with the attempt whose write-down it carries', async () => {
    const rigged = await rig();

    await repayment(rigged, FIRST_PAYMENT_MINOR);

    expect((await rigged.loans.findById(rigged.loan.id))?.lastRepaymentId).toMatch(/^rpy_/);
  });
});

describe('a single repayment', () => {
  it('books exactly one entry and debits the nominated account by it', async () => {
    const rigged = await rig();
    const before = gbp(OPENING_BALANCE_MINOR);

    await repayment(rigged, FIRST_PAYMENT_MINOR);

    const after = await rigged.accounts.findById(rigged.accountId);
    const balance = after ? fromStored(after.ledgerBalance) : before;

    expect(await repaymentEntries(rigged)).toHaveLength(1);
    expect(balance.equals(before.minus(gbp(FIRST_PAYMENT_MINOR)))).toBe(true);
  });

  it('refuses a payment the nominated account cannot cover, before claiming the loan', async () => {
    const rigged = await rig({ openingMinor: '5000' });

    await expect(repayment(rigged, FIRST_PAYMENT_MINOR)).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });

    const untouched = await rigged.loans.findById(rigged.loan.id);
    expect(untouched?.repaymentCount).toBe(0);
    expect(await repaymentEntries(rigged)).toHaveLength(0);
  });

  it('collects nothing, and books nothing, when there is nothing owed to collect', async () => {
    const rigged = await rig();
    await rigged.loans.patch(rigged.loan.id, {
      outstandingPrincipal: toStored(Money.zero('GBP')),
    });

    await repayment(rigged, FIRST_PAYMENT_MINOR);

    expect(await repaymentEntries(rigged)).toHaveLength(0);
  });
});
