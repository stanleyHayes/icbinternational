import { Injectable } from '@nestjs/common';

import { BillPaymentStatus, ErrorCode, type CreateTopUpRequest } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromWire, toStored } from '../../common/money/money.codec.js';
import { AccountService, assertAccountUsable } from '../accounts/index.js';

import { BillPaymentBookingService } from './bill-payment-booking.service.js';
import { PaymentKind, type BillPaymentRecord } from './bill-payment.store.js';
import { BillSubmissionQueue } from './bill-submission.queue.js';

/** Smallest top-up the mobile gateways will process, in minor units. */
const MINIMUM_TOP_UP_MINOR = 300n;

/** Largest single top-up, in minor units. Above this the network wants a bank transfer. */
const MAXIMUM_TOP_UP_MINOR = 10_000n;

/** A data bundle is identified by a code; airtime is just an amount. */
const BUNDLE_REQUIRING_CODE = 'DATA';

/**
 * Airtime and data top-ups.
 *
 * The same lifecycle as a bill payment, because it is one: the customer is debited, a
 * gateway is asked, and a refusal is refunded inside the job that discovered it. Only the
 * payee differs — a mobile provider identified by name and a handset number, rather than a
 * biller in the directory — which is why it shares the record, the booking service and the
 * submission worker instead of growing a parallel set of all three.
 *
 * The limits are the network's, not the bank's. A gateway will not sell three pence of
 * airtime and will not put a hundred pounds on a prepaid handset in one go, so refusing
 * those here saves the customer a round trip to be told the same thing by somebody else.
 */
@Injectable()
export class TopUpService {
  constructor(
    private readonly accounts: AccountService,
    private readonly booking: BillPaymentBookingService,
    private readonly submissions: BillSubmissionQueue,
  ) {}

  /**
   * Validates, debits and queues a top-up.
   *
   * @throws {AppError} `AMOUNT_BELOW_MINIMUM` / `AMOUNT_ABOVE_MAXIMUM` outside the
   *   gateway's limits, `VALIDATION_FAILED` for a data bundle with no bundle code, and
   *   `INSUFFICIENT_FUNDS` when the account cannot cover it.
   */
  async create(input: { userId: string; request: CreateTopUpRequest }): Promise<BillPaymentRecord> {
    const { request } = input;
    const amount = fromWire(request.amount);

    assertWithinGatewayLimits(amount);
    assertBundleIdentified(request);

    const account = await this.accounts.requireOwned(request.sourceAccountId, input.userId);
    assertAccountUsable(account);

    const now = this.booking.now();
    const payment = await this.booking.book({
      userId: input.userId,
      kind: PaymentKind.TOP_UP,
      billerId: providerSlug(request.provider),
      billerName: request.provider,
      status: BillPaymentStatus.PENDING,
      sourceAccountId: account.id,
      customerReference: request.phone,
      amount: toStored(amount),
      fee: toStored(Money.zero(amount.currency)),
      topUp: {
        provider: request.provider,
        phone: request.phone,
        bundle: request.bundle,
        bundleCode: request.bundleCode ?? null,
      },
      transactionId: null,
      journalEntryId: null,
      scheduledFor: now,
      createdAt: now,
    });

    await this.submissions.enqueue(payment.id);
    return payment;
  }
}

function assertWithinGatewayLimits(amount: Money): void {
  const minimum = Money.fromMinor(MINIMUM_TOP_UP_MINOR, amount.currency);
  const maximum = Money.fromMinor(MAXIMUM_TOP_UP_MINOR, amount.currency);

  if (amount.lessThan(minimum)) {
    throw new AppError({
      code: ErrorCode.AMOUNT_BELOW_MINIMUM,
      message: `The smallest top-up we can send is ${minimum.format()}.`,
    });
  }

  if (amount.greaterThan(maximum)) {
    throw new AppError({
      code: ErrorCode.AMOUNT_ABOVE_MAXIMUM,
      message: `The largest top-up we can send in one go is ${maximum.format()}.`,
    });
  }
}

/** A data bundle without a code is an amount with nowhere to go. */
function assertBundleIdentified(request: CreateTopUpRequest): void {
  if (request.bundle !== BUNDLE_REQUIRING_CODE || request.bundleCode) return;

  throw AppError.validation('Choose which data bundle you would like.', [
    { path: 'bundleCode', message: 'is required for a data bundle' },
  ]);
}

/**
 * A stable identifier for a provider that is not in the biller directory.
 *
 * Top-up gateways are reached by name rather than by slug, but the payment record still
 * needs something searchable in the `billerId` column — "show me every EE top-up this
 * month" has to be an index scan. Derived rather than generated, so the same provider
 * always lands on the same key.
 */
export function providerSlug(provider: string): string {
  return provider
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}
