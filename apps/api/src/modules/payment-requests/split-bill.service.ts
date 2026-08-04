import { Injectable } from '@nestjs/common';

import { type SplitBillRequest } from '@reliance/contracts';
import { allocateMinor, Money } from '@reliance/money';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { fromWire } from '../../common/money/money.codec.js';

import { PaymentRequestService } from './payment-request.service.js';
import { type PaymentRequestRecord } from './payment-request.store.js';

/** Weight of the requester's own share when they are one of the payers. */
const OWN_SHARE = 1;

/**
 * Splitting a bill across several people.
 *
 * **Nobody loses a penny to rounding.** £100 across three people is not £33.33 three times —
 * that is £99.99, and the tenth penny has to go somewhere. `allocateMinor` distributes the
 * remainder deterministically across the shares, so the requests always add up to exactly
 * the total, and the same input always produces the same split.
 *
 * **`excludeSelf` decides whether the requester is paying.** With it set — the default — the
 * requester counts as one share and simply keeps their own portion; four people splitting
 * dinner means three requests for a quarter each. With it clear, the requester is not one of
 * the payers and the whole total is divided among the people named, which is what a landlord
 * splitting a utility bill or a business recharging a cost wants.
 *
 * Every request in a split carries the same `splitId`, so "who has paid me back?" is one
 * query rather than a reconciliation.
 */
@Injectable()
export class SplitBillService {
  constructor(
    private readonly requests: PaymentRequestService,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * Raises one request per participant, together adding up to exactly the total.
   *
   * @throws {AppError} everything {@link PaymentRequestService.create} throws — a
   *   destination that is not theirs, a frozen account, a currency mismatch.
   */
  async split(input: {
    userId: string;
    request: SplitBillRequest;
  }): Promise<readonly PaymentRequestRecord[]> {
    const { request } = input;
    const total = fromWire(request.totalAmount);
    const shares = sharesFor(request);
    const portions = allocate(total, shares);

    const splitId = this.ids.generate('transferOrder');
    const raised: PaymentRequestRecord[] = [];

    for (const [index, participant] of request.participants.entries()) {
      raised.push(
        await this.requests.create({
          userId: input.userId,
          destinationAccountId: request.destinationAccountId,
          amount: portions[index] ?? Money.zero(total.currency),
          splitId,
          payeeName: participant.name,
          ...(request.note === undefined ? {} : { note: request.note }),
          ...(participant.email === undefined ? {} : { payeeEmail: participant.email }),
        }),
      );
    }

    return raised;
  }
}

/**
 * The weights the total is divided by.
 *
 * The requester's own share is appended when they are one of the payers, so it takes part in
 * the division and absorbs its fair portion of the rounding remainder — but no request is
 * raised against it. Dropping it from the weights instead would silently ask the others to
 * cover the requester's share.
 */
export function sharesFor(request: SplitBillRequest): readonly number[] {
  const participants = request.participants.map((participant) => participant.shares);
  return request.excludeSelf ? [...participants, OWN_SHARE] : participants;
}

/** The amount each participant is asked for. The requester's own portion is dropped here. */
function allocate(total: Money, shares: readonly number[]): readonly Money[] {
  return allocateMinor(total.amount, shares).map((minor) => Money.fromMinor(minor, total.currency));
}
