import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, HoldStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { PostingService } from '../ledger/posting.service.js';

import { captureEntryFor } from './capture-recipes.js';
import { CAPTURE_REFERENCE_PREFIX, HOLD_TRANSACTION_LABEL } from './hold.constants.js';
import { HoldService } from './hold.service.js';
import { type HoldRecord } from './hold.store.js';

/**
 * Turning a hold into money that has actually moved.
 *
 * Three things happen and they are one transaction:
 *
 * 1. the entry is booked through `PostingService`, debiting the customer for what was
 *    genuinely taken;
 * 2. the hold is marked `CAPTURED`, conditionally on it still being `ACTIVE`;
 * 3. the full reserve is returned to availability, leaving any unspent difference free.
 *
 * **Exactly once.** Two captures of the same hold race on step 2's conditional write and
 * exactly one wins; the loser's transaction aborts, unwinding its posting, and it is told
 * `HOLD_ALREADY_RELEASED`. Even if a caller retries with the same reference, the ledger's
 * own idempotency on `reference` returns the entry already booked rather than booking a
 * second one — so the money can only leave once whichever layer catches the repeat.
 */
@Injectable()
export class HoldCaptureService {
  private readonly logger = new Logger(HoldCaptureService.name);

  constructor(
    private readonly holds: HoldService,
    private readonly postings: PostingService,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Captures a hold, in full or in part.
   *
   * @param input.amount What the claimant is actually taking. Defaults to the whole hold;
   *   more than the hold is refused, because the customer only ever agreed to the hold.
   * @throws {AppError} `HOLD_NOT_FOUND`, `HOLD_ALREADY_RELEASED`, `INVALID_AMOUNT`,
   *   `AMOUNT_ABOVE_MAXIMUM`, or `PRECONDITION_FAILED` for a hold that cannot be captured.
   */
  async capture(input: CaptureHoldInput): Promise<HoldRecord> {
    const captured = await this.runner.runIn(
      input.session,
      (session) => this.captureWithin(input, session),
      { label: HOLD_TRANSACTION_LABEL.CAPTURE },
    );

    this.logger.log(`Captured ${input.holdId} against ${captured.accountId}`);
    return captured;
  }

  private async captureWithin(
    input: CaptureHoldInput,
    session: ClientSession,
  ): Promise<HoldRecord> {
    const hold = await this.holds.require(input.holdId, session);
    assertActive(hold);

    const reserved = fromStored(hold.amount);
    const amount = input.amount ?? reserved;
    assertCapturable(amount, reserved, hold);

    const entry = await this.postings.post(
      captureEntryFor({
        hold,
        amount,
        reference: input.reference ?? `${CAPTURE_REFERENCE_PREFIX}${hold.id}`,
        description: input.description ?? hold.description,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
      }),
      session,
    );

    return this.holds.resolveWithin({
      hold,
      status: HoldStatus.CAPTURED,
      capturedAmount: amount,
      capturedEntryId: entry.id,
      session,
    });
  }
}

export interface CaptureHoldInput {
  readonly holdId: string;
  /** Omit to capture the whole hold. */
  readonly amount?: Money;
  /**
   * The journal reference. Defaults to one derived from the hold id, which makes a
   * repeated capture idempotent at the ledger as well as at the hold.
   */
  readonly reference?: string;
  readonly description?: string;
  readonly session?: ClientSession;
}

function assertActive(hold: HoldRecord): void {
  if (hold.status === HoldStatus.ACTIVE) return;

  throw new AppError({
    code: ErrorCode.HOLD_ALREADY_RELEASED,
    message: `That hold was already ${hold.status.toLowerCase()}.`,
    context: { holdId: hold.id, status: hold.status },
  });
}

/**
 * A capture may take less than was held, never more.
 *
 * The hold is the customer's exposure: they agreed that this much might be taken, and a
 * claimant who wants more has to authorise again. Allowing an over-capture would let a
 * merchant debit an account for an amount that never passed a funds check.
 */
function assertCapturable(amount: Money, reserved: Money, hold: HoldRecord): void {
  if (!amount.isPositive) {
    throw new AppError({
      code: ErrorCode.INVALID_AMOUNT,
      message: 'A capture must be for a positive amount. Release the hold instead.',
      context: { holdId: hold.id, amount: amount.toJSON() },
    });
  }

  if (amount.greaterThan(reserved)) {
    throw new AppError({
      code: ErrorCode.AMOUNT_ABOVE_MAXIMUM,
      message: `This capture is larger than the ${reserved.format()} held against the account.`,
      context: { holdId: hold.id, reserved: reserved.toJSON(), requested: amount.toJSON() },
    });
  }
}
