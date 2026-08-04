import { EntryType, LoanApplicationStatus, type LoanQuote } from '@reliance/contracts';
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
import { buildSchedule } from '../amortisation.js';
import { InMemoryLoanApplicationStore } from '../in-memory-loan-application.store.js';
import { InMemoryLoanStore } from '../in-memory-loan.store.js';
import { LoanDisbursementService } from '../loan-disbursement.service.js';
import { LoanLedgerService } from '../loan-ledger.service.js';
import { LOAN_PRODUCTS } from '../loan-products.catalogue.js';
import { toQuoteRows } from '../loan.mapper.js';

/**
 * Two acceptances of one offer, at the same instant.
 *
 * `acceptOffer` used to read the application, validate it in memory, create the loan, fund
 * it, and only then write the status that was supposed to stop a second acceptance. Two
 * concurrent clicks both passed the validation before either wrote, so both created a loan
 * and both disbursed — the bank lent twice against a single credit decision, and the
 * customer's account was credited twice.
 *
 * The fix is a claim: an atomic move out of `OFFER_MADE`, taken before anything is created
 * and before any money moves, with the whole of the rest of the drawdown depending on
 * having won it. These tests fire both acceptances through the real service over the real
 * `PostingService` and assert what an auditor would: one loan, one advance, one arrangement
 * fee, and an account credited once.
 */

const BUSINESS_DATE = new Date('2026-01-15T09:00:00.000Z');
const ADVANCE_MINOR = '1200000';
const TERM_MONTHS = 24;
const FIRST_PAYMENT_DATE = '2026-02-15';

/** The currency the whole fixture is denominated in. */
const CURRENCY = 'GBP';

/**
 * A catalogue product that charges an arrangement fee.
 *
 * Drawdown books two entries — the advance and then the fee — and a fee-free product would
 * let a double-charged fee go unnoticed. Choosing the one with a fee tests both postings.
 */
const PRODUCT = LOAN_PRODUCTS.find((product) => product.arrangementFee.amount !== '0');

interface Rig {
  readonly disbursement: LoanDisbursementService;
  readonly applications: InMemoryLoanApplicationStore;
  readonly loans: InMemoryLoanStore;
  readonly accounts: InMemoryAccountStore;
  readonly ledger: LedgerRig;
  readonly accountId: string;
  readonly applicationId: string;
}

/** An offer priced exactly as the quote service would have priced it. */
function anOffer(): LoanQuote {
  const amount = gbp(ADVANCE_MINOR);
  const built = buildSchedule({
    principal: amount,
    aprBps: PRODUCT?.representativeAprBps ?? 0,
    termMonths: TERM_MONTHS,
    firstPaymentDate: FIRST_PAYMENT_DATE,
  });

  return {
    productCode: PRODUCT?.code ?? '',
    amount: toWire(amount),
    termMonths: TERM_MONTHS,
    aprBps: PRODUCT?.representativeAprBps ?? 0,
    monthlyPayment: toWire(built.monthlyPayment),
    totalRepayable: toWire(built.totalRepayable),
    totalInterest: toWire(built.totalInterest),
    arrangementFee: PRODUCT?.arrangementFee ?? toWire(Money.zero(CURRENCY)),
    firstPaymentDate: FIRST_PAYMENT_DATE,
    schedule: toQuoteRows(built),
  };
}

async function rig(): Promise<Rig> {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock(BUSINESS_DATE);
  const runner = retryingRunner();
  const ledgerRig = ledgerRigFor(accounts, clock, runner);

  const accountId = await seedAccount(accounts, { ledger: gbp('0') });
  const applications = new InMemoryLoanApplicationStore(new IdGenerator());
  const offer = anOffer();

  const application = await applications.insert({
    userId: TEST_USER,
    productCode: offer.productCode,
    status: LoanApplicationStatus.OFFER_MADE,
    requestedAmount: toStored(gbp(ADVANCE_MINOR)),
    termMonths: TERM_MONTHS,
    purpose: 'Home improvements',
    disbursementAccountId: accountId,
    declaredMonthlyIncome: toStored(gbp('400000')),
    declaredMonthlyDebtPayments: toStored(gbp('30000')),
    declaredEmploymentMonths: 48,
    offer,
    offerExpiresAt: new Date('2026-02-15T09:00:00.000Z'),
    declineReasons: [],
    requiredDocumentKinds: [],
    suppliedDocumentKinds: [],
    creditScore: 720,
    debtToIncomeBps: 750,
    submittedAt: BUSINESS_DATE,
    decidedAt: BUSINESS_DATE,
    acceptedAt: null,
    createdAt: BUSINESS_DATE,
    loanId: null,
  });

  const loans = new InMemoryLoanStore(new IdGenerator());
  const disbursement = new LoanDisbursementService(
    loans,
    applications,
    new AccountService(accounts, clock, runner),
    new LoanLedgerService(ledgerRig.postings, clock),
    runner,
  );

  return {
    disbursement,
    applications,
    loans,
    accounts,
    ledger: ledgerRig,
    accountId,
    applicationId: application.id,
  };
}

function accept(rigged: Rig): Promise<unknown> {
  return rigged.disbursement.acceptOffer(TEST_USER, rigged.applicationId);
}

async function entriesOfType(rigged: Rig, type: EntryType): Promise<unknown[]> {
  const all = await rigged.ledger.entries.findSince(new Date(0));
  return all.filter((entry) => entry.type === type);
}

describe('two concurrent acceptances of one offer', () => {
  it('creates exactly one loan', async () => {
    const rigged = await rig();

    await Promise.allSettled([accept(rigged), accept(rigged)]);

    expect(rigged.loans.all()).toHaveLength(1);
  });

  it('disburses exactly once, and charges the arrangement fee exactly once', async () => {
    const rigged = await rig();

    await Promise.allSettled([accept(rigged), accept(rigged)]);

    expect(await entriesOfType(rigged, EntryType.LOAN_DISBURSEMENT)).toHaveLength(1);
    expect(await entriesOfType(rigged, EntryType.FEE)).toHaveLength(1);
  });

  it('credits the customer the advance once, net of the one arrangement fee', async () => {
    const rigged = await rig();

    await Promise.allSettled([accept(rigged), accept(rigged)]);

    const account = await rigged.accounts.findById(rigged.accountId);
    const fee = gbp(PRODUCT?.arrangementFee.amount ?? '0');
    const expected = gbp(ADVANCE_MINOR).minus(fee);

    const balance = account ? fromStored(account.ledgerBalance) : gbp('0');
    expect(balance.equals(expected)).toBe(true);
  });

  it('refuses the loser rather than lending to it twice', async () => {
    const rigged = await rig();

    const outcomes = await Promise.allSettled([accept(rigged), accept(rigged)]);
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('leaves the application disbursed and stamped with the one loan it became', async () => {
    const rigged = await rig();

    await Promise.allSettled([accept(rigged), accept(rigged)]);

    const application = await rigged.applications.findById(rigged.applicationId);
    expect(application?.status).toBe(LoanApplicationStatus.DISBURSED);
    expect(application?.loanId).toBe(rigged.loans.all()[0]?.id);
  });
});
