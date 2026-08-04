import { type ClientSession } from 'mongoose';

import { BillPaymentStatus, type Biller } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import {
  BillerRailPort,
  BillerRejection,
  type BillerAccountCheck,
  type BillerOutcome,
  type BillerSubmission,
  type TopUpSubmission,
} from '../../../rails/biller/index.js';
import { type BillPaymentPoster } from '../bill-payment.poster.js';
import { PaymentKind, type NewBillPayment } from '../bill-payment.store.js';
import { BillRefundSweeperService } from '../bill-refund-sweeper.service.js';
import { BillRefundService } from '../bill-refund.service.js';
import { BillSubmissionService } from '../bill-submission.service.js';
import { InMemoryBillPaymentStore } from '../in-memory-bill-payment.store.js';

/**
 * Stand-ins for the collaborators the reversal path depends on.
 *
 * The rail stub is scripted rather than random, so a test can say "this payment is refused"
 * and assert on the consequence instead of hunting for a payment the simulator happens to
 * refuse. Everything else — the store, the status preconditions, the ordering — is the real
 * implementation.
 */

/** A session stand-in. The in-memory store ignores it, as the real one would use it. */
export const NO_SESSION = null as unknown as ClientSession;

/** A runner that executes the callback and lets a throw escape, as a rollback would. */
export function fakeRunner(): TransactionRunner {
  return {
    async run<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
      return work(NO_SESSION);
    },
    async runIn<T>(
      session: ClientSession | undefined,
      work: (session: ClientSession) => Promise<T>,
    ): Promise<T> {
      return work(session ?? NO_SESSION);
    },
  } as unknown as TransactionRunner;
}

/** A biller rail whose answer the test chooses. */
export class ScriptedBillerRail extends BillerRailPort {
  readonly submitted: string[] = [];
  private outcome: BillerOutcome = {
    accepted: true,
    receipt: 'RB0000000001',
    latencyMs: 250,
  };

  private thrown: Error | null = null;

  accepts(receipt = 'RB0000000001'): this {
    this.outcome = { accepted: true, receipt, latencyMs: 250 };
    return this;
  }

  refuses(rejection: BillerRejection = BillerRejection.UNKNOWN_ACCOUNT): this {
    this.outcome = { accepted: false, rejection, latencyMs: 700 };
    return this;
  }

  goesQuiet(): this {
    this.outcome = { accepted: false, rejection: BillerRejection.NO_RESPONSE, latencyMs: 30_000 };
    return this;
  }

  /**
   * Throws instead of answering, the way a worker dying mid-call looks from the outside:
   * the payment has been claimed `SUBMITTED` and no answer will ever be recorded against it.
   */
  crashes(): this {
    this.thrown = new Error('the connection to the biller was lost');
    return this;
  }

  /** The network comes back. Whatever it says now, it says late. */
  recovers(): this {
    this.thrown = null;
    return this;
  }

  override async checkAccount(): Promise<BillerAccountCheck> {
    return { valid: true, accountName: 'The account holder', rejection: null };
  }

  override async submit(submission: BillerSubmission): Promise<BillerOutcome> {
    return this.answer(submission.paymentId);
  }

  override async submitTopUp(submission: TopUpSubmission): Promise<BillerOutcome> {
    return this.answer(submission.paymentId);
  }

  private async answer(paymentId: string): Promise<BillerOutcome> {
    this.submitted.push(paymentId);
    if (this.thrown) throw this.thrown;
    return this.outcome;
  }
}

/** A poster that records the entries it was asked to book, in order. */
export class RecordingBillPoster {
  readonly booked: string[] = [];

  /** The ledger's `reference` index, modelled: one reversal entry per payment, ever. */
  private readonly reversalIds = new Map<string, string>();
  private reversalAttempts = 0;
  private reversalFailures = 0;

  constructor(private readonly clock: ClockService) {}

  /**
   * Makes the next `count` reversals throw, the way a lost connection or an exhausted
   * write-conflict retry would. Nothing is recorded, because nothing was booked.
   */
  failReversals(count: number): this {
    this.reversalFailures = count;
    return this;
  }

  now(): Date {
    return this.clock.now();
  }

  async postDebit(payment: { id: string }): Promise<{
    entryId: string;
    transactionId: string | null;
  }> {
    this.booked.push(`debit:${payment.id}`);
    return { entryId: `jnl_debit_${payment.id}`, transactionId: `txn_${payment.id}` };
  }

  async postSettlement(payment: { id: string }): Promise<{
    settlementEntryId: string;
    feeEntryId: string | null;
  }> {
    this.booked.push(`settle:${payment.id}`);
    return { settlementEntryId: `jnl_settle_${payment.id}`, feeEntryId: null };
  }

  /**
   * Books a reversal, or hands back the one already booked.
   *
   * The dedupe is not a convenience — it is the real `PostingService` behaviour modelled
   * honestly. A reversal's journal reference is derived from the payment id and the ledger
   * carries a unique index on it, so a second attempt returns the first attempt's entry
   * instead of moving money again. A fake that credited twice here would let a
   * double-refund ship while the test stayed green.
   */
  async postReversal(payment: { id: string }): Promise<string> {
    this.reversalAttempts += 1;

    if (this.reversalFailures > 0) {
      this.reversalFailures -= 1;
      throw new Error('the reversal could not be committed');
    }

    const existing = this.reversalIds.get(payment.id);
    if (existing) return existing;

    const entryId = `jnl_reverse_${payment.id}`;
    this.reversalIds.set(payment.id, entryId);
    this.booked.push(`reverse:${payment.id}`);
    return entryId;
  }

  /** How many reversals actually reached the ledger. The double-refund detector. */
  get reversalCount(): number {
    return this.booked.filter((entry) => entry.startsWith('reverse:')).length;
  }

  /** How many times a reversal was attempted, booked or not. */
  get reversalTries(): number {
    return this.reversalAttempts;
  }

  /** Typed as the real collaborator, so the service is wired exactly as in production. */
  asPoster(): BillPaymentPoster {
    return this as unknown as BillPaymentPoster;
  }
}

/** Every collaborator on the submit-and-refund path, wired as the module wires them. */
export interface BillPayRig {
  readonly clock: ClockService;
  readonly payments: InMemoryBillPaymentStore;
  readonly poster: RecordingBillPoster;
  readonly rail: ScriptedBillerRail;
  readonly refunds: BillRefundService;
  readonly service: BillSubmissionService;
  readonly sweeper: BillRefundSweeperService;
}

/**
 * The lane, assembled.
 *
 * The refund service and the sweeper are the real implementations rather than doubles —
 * whether a stranded payment is recoverable is precisely the thing under test, and a stub
 * that always recovers would prove nothing.
 */
export function billPayRig(): BillPayRig {
  const clock = frozenClock();
  const payments = paymentStore();
  const poster = new RecordingBillPoster(clock);
  const rail = new ScriptedBillerRail();
  const runner = fakeRunner();

  const refunds = new BillRefundService(payments, poster.asPoster(), runner);

  return {
    clock,
    payments,
    poster,
    rail,
    refunds,
    service: new BillSubmissionService(payments, poster.asPoster(), rail, refunds, runner),
    sweeper: new BillRefundSweeperService(payments, refunds, clock),
  };
}

/** A clock pinned to a known instant. */
export function frozenClock(iso = '2026-03-02T09:00:00.000Z'): ClockService {
  const clock = new ClockService();
  clock.freezeAt(new Date(iso));
  return clock;
}

export function paymentStore(): InMemoryBillPaymentStore {
  return new InMemoryBillPaymentStore(new IdGenerator());
}

/** A £42.50 water bill, ready to be inserted and debited. */
export function paymentDraft(now: Date, overrides: Partial<NewBillPayment> = {}): NewBillPayment {
  return {
    userId: 'usr_01JQ8Z0000000000000000000A',
    kind: PaymentKind.BILL,
    billerId: 'thames-water',
    billerName: 'Thames Water',
    status: BillPaymentStatus.PENDING,
    sourceAccountId: 'acc_01JQ8Z0000000000000000000A',
    customerReference: '1234567890',
    amount: toStored(Money.fromMajor('42.50', 'GBP')),
    fee: toStored(Money.zero('GBP')),
    topUp: null,
    transactionId: null,
    journalEntryId: 'jnl_debit_existing',
    scheduledFor: now,
    createdAt: now,
    ...overrides,
  };
}

/** A biller with a real account-number format and real limits. */
export function billerFixture(overrides: Partial<Biller> = {}): Biller {
  return {
    id: 'thames-water',
    name: 'Thames Water',
    category: 'WATER',
    logoUrl: null,
    accountNumberPattern: String.raw`^\d{10}$`,
    accountNumberLabel: 'Customer reference',
    minAmount: { amount: '100', currency: 'GBP' },
    maxAmount: { amount: '500000', currency: 'GBP' },
    fee: { amount: '0', currency: 'GBP' },
    supportsValidation: true,
    active: true,
    ...overrides,
  } as Biller;
}
