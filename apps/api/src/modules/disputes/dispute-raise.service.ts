import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  DisputeStatus,
  ErrorCode,
  TransactionDirection,
  type CreateDisputeRequest,
} from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored, fromWire, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import {
  TransactionStore,
  type TransactionRecord,
} from '../transactions/repositories/transaction.store.js';

import { formatDeadline, formatStoredAmount } from './dispute-format.js';
import { DisputePoster } from './dispute.poster.js';
import { DisputeStore, type DisputeRecord, type NewDispute } from './dispute.store.js';
import {
  DECISION_DUE_DAYS,
  DISPUTE_TRANSACTION_LABEL,
  DISPUTE_WINDOW_DAYS,
  MERCHANT_RESPONSE_DAYS,
} from './disputes.constants.js';
import {
  deadlineFrom,
  isWithinDisputeWindow,
  resolveDisputedAmount,
} from './domain/dispute-lifecycle.js';
import { DisputeNotifier } from './ports/dispute-notifier.port.js';

/** A customer disputing one of their own movements. */
export interface RaiseDisputeInput {
  readonly userId: string;
  readonly request: CreateDisputeRequest;
}

/**
 * Raising a dispute, and putting the money back while it runs.
 *
 * Provisional credit is given on every case the bank accepts, not on a subset: the
 * customer is told so in writing the moment the dispute opens, and a promise made in an
 * email has to be made true by the accounting. It is real money and moves through
 * `PostingService` as a balanced entry, so the case, the credit and the statement line
 * commit together or not at all.
 *
 * Three guards stand between a request and a case, in the order a customer would want
 * them answered: the movement has to be theirs, it has to be a payment that left the
 * account, and it has to be inside the scheme's window. Only then does the amount get
 * resolved, because "how much" is not a question worth asking about a payment nobody may
 * dispute.
 */
@Injectable()
export class DisputeRaiseService {
  constructor(
    private readonly disputes: DisputeStore,
    private readonly transactions: TransactionStore,
    private readonly poster: DisputePoster,
    private readonly notifier: DisputeNotifier,
    private readonly runner: TransactionRunner,
  ) {}

  async raise(input: RaiseDisputeInput): Promise<DisputeRecord> {
    const transaction = await this.requireDisputable(input);
    const amount = resolveAmount(input.request, transaction);

    if (await this.disputes.findByTransactionId(transaction.id)) {
      throw alreadyRaised(transaction.id);
    }

    const dispute = await this.openCase({ transaction, amount, request: input.request });

    await this.notifier.disputeRaised({
      userId: dispute.userId,
      reference: dispute.id,
      merchantName: merchantNameOf(transaction),
      amountFormatted: formatStoredAmount(dispute.disputedAmount),
      decisionBy: formatDeadline(dispute.decisionDueAt),
    });

    return dispute;
  }

  /**
   * Opens the case, translating the unique index into the answer the client expects.
   *
   * The lookup above closes the ordinary duplicate; this closes the race, where two
   * submissions pass that lookup together and the database decides which one exists.
   * Reporting the loser as `DISPUTE_ALREADY_RAISED` rather than as an internal error is
   * what lets a double-tapped form settle on the case that was actually created.
   */
  private async openCase(input: OpenCaseInput): Promise<DisputeRecord> {
    try {
      return await this.runner.run((session) => this.open(input, session), {
        label: DISPUTE_TRANSACTION_LABEL.RAISE,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      throw alreadyRaised(input.transaction.id);
    }
  }

  /**
   * The transactional body: write the case, credit the customer, record the credit.
   *
   * The insert comes first because the entry's reference is derived from the dispute id,
   * and a reference minted before the row it names could be booked against a case that
   * never existed.
   */
  private async open(input: OpenCaseInput, session: ClientSession): Promise<DisputeRecord> {
    const created = await this.disputes.insert(newCase(input, this.poster.now()), session);
    const entryId = await this.poster.creditProvisionally(created, input.amount, session);
    const at = this.poster.now();

    const credited = await this.disputes.applyTransition(
      {
        id: created.id,
        set: {
          status: DisputeStatus.UNDER_REVIEW,
          provisionalCredit: toStored(input.amount),
          provisionalCreditAt: at,
          provisionalCreditEntryId: entryId,
        },
        timelineEntry: { status: DisputeStatus.UNDER_REVIEW, at, detail: CREDITED_DETAIL },
      },
      session,
    );

    return credited ?? created;
  }

  private async requireDisputable(input: RaiseDisputeInput): Promise<TransactionRecord> {
    const transaction = await this.transactions.findByPublicId(input.request.transactionId);

    // Indistinguishable from "no such movement", for the same reason the dispute reads are.
    if (!transaction || transaction.userId !== input.userId) {
      throw AppError.notFound('Transaction', input.request.transactionId);
    }

    assertDisputable(transaction, this.poster.now());
    return transaction;
  }
}

interface OpenCaseInput {
  readonly transaction: TransactionRecord;
  readonly amount: Money;
  readonly request: CreateDisputeRequest;
}

const CREDITED_DETAIL = 'We have credited the amount to your account while we investigate.';

/** MongoDB's duplicate-key error. Local because it is the only one this module reads. */
const DUPLICATE_KEY_CODE = 11_000;

function newCase(input: OpenCaseInput, now: Date): NewDispute {
  const { transaction, request } = input;

  return {
    transactionId: transaction.id,
    userId: transaction.userId,
    accountId: transaction.accountId,
    status: DisputeStatus.SUBMITTED,
    reason: request.reason,
    description: request.description,
    disputedAmount: toStored(input.amount),
    provisionalCredit: null,
    provisionalCreditAt: null,
    provisionalCreditEntryId: null,
    resolutionEntryId: null,
    evidenceIds: [...request.evidenceIds],
    merchantResponse: null,
    outcomeSummary: null,
    contactedMerchant: request.contactedMerchant,
    timeline: [{ status: DisputeStatus.SUBMITTED, at: now, detail: RAISED_DETAIL }],
    merchantResponseDueAt: deadlineFrom(now, MERCHANT_RESPONSE_DAYS),
    decisionDueAt: deadlineFrom(now, DECISION_DUE_DAYS),
    createdAt: now,
    resolvedAt: null,
  };
}

const RAISED_DETAIL = 'You told us about this payment and we opened a case.';

function assertDisputable(transaction: TransactionRecord, now: Date): void {
  if (transaction.direction !== TransactionDirection.DEBIT) {
    throw AppError.validation('Only a payment that left your account can be disputed.', [
      { path: 'transactionId', message: 'This movement paid money in rather than out.' },
    ]);
  }

  if (!isWithinDisputeWindow(transaction.bookedAt, now, DISPUTE_WINDOW_DAYS)) {
    throw new AppError({
      code: ErrorCode.DISPUTE_WINDOW_CLOSED,
      message:
        `A payment can be disputed for ${DISPUTE_WINDOW_DAYS} days after it was made, and ` +
        'this one is older than that. Please contact us and we will see what can be done.',
    });
  }
}

/** How much of the movement is being contested. Omitting the amount contests all of it. */
function resolveAmount(request: CreateDisputeRequest, transaction: TransactionRecord): Money {
  const requested = request.disputedAmount ? fromWire(request.disputedAmount) : null;
  const amount = resolveDisputedAmount(requested, fromStored(transaction.amount));

  if (!amount) {
    throw AppError.validation('The amount disputed does not fit the payment.', [
      {
        path: 'disputedAmount',
        message: 'Send an amount above zero, in the same currency, no larger than the payment.',
      },
    ]);
  }

  return amount;
}

function merchantNameOf(transaction: TransactionRecord): string {
  return transaction.counterparty?.name ?? transaction.description;
}

function alreadyRaised(transactionId: string): AppError {
  return AppError.conflict(
    ErrorCode.DISPUTE_ALREADY_RAISED,
    `This payment is already being disputed. Open the existing case for ${transactionId} ` +
      'to see where it stands.',
  );
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}
