import { Injectable } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { toStored } from '../../common/money/money.codec.js';
import { AccountService, assertAccountUsable } from '../accounts/index.js';
import { UsersService } from '../auth/users/index.js';

import { DEFAULT_EXPIRY_HOURS, MS_PER_HOUR } from './payment-request.constants.js';
import { mintToken } from './payment-request.mapper.js';
import { type NewPaymentRequest } from './payment-request.store.js';

/** Everything a caller supplies; everything else is derived here. */
export interface RequestDraft {
  readonly userId: string;
  readonly destinationAccountId: string;
  readonly amount: Money;
  readonly note?: string;
  readonly expiresInHours?: number;
  /** Who is being asked, when the request came from a split rather than an open link. */
  readonly payeeName?: string;
  readonly payeeEmail?: string;
  /** Groups every request created by one split bill. */
  readonly splitId?: string;
}

/**
 * Building a request that is safe to publish.
 *
 * Everything checkable happens here, before a link exists. The destination has to be the
 * requester's own account and it has to be able to receive money — publishing a link that
 * pays into a frozen account would take a stranger's money and strand it, and they would
 * have no way of knowing until it had already left them.
 *
 * The requester's name is read from their profile rather than accepted from the request
 * body. A payment link says who is asking, and letting the asker choose that string is how
 * a link that claims to be from somebody else gets made.
 */
@Injectable()
export class PaymentRequestFactory {
  constructor(
    private readonly accounts: AccountService,
    private readonly users: UsersService,
    private readonly clock: ClockService,
  ) {}

  /** The bank's current time, so every collaborator reads one clock. */
  now(): Date {
    return this.clock.now();
  }

  /**
   * Validates a draft and fills in the parts the customer does not get to choose.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND` when the destination is not theirs,
   *   `ACCOUNT_FROZEN` / `ACCOUNT_CLOSED` when it cannot receive money, and
   *   `CURRENCY_MISMATCH` when the amount is not in the account's currency.
   */
  async build(draft: RequestDraft): Promise<NewPaymentRequest> {
    const account = await this.accounts.requireOwned(draft.destinationAccountId, draft.userId);
    assertAccountUsable(account);

    if (account.currency !== draft.amount.currency) {
      throw new AppError({
        code: ErrorCode.CURRENCY_MISMATCH,
        message: `That account is held in ${account.currency}, so you can only ask to be paid in ${account.currency}.`,
        context: { accountCurrency: account.currency, requested: draft.amount.currency },
      });
    }

    const user = await this.users.requireById(draft.userId);
    const now = this.clock.now();

    return {
      userId: draft.userId,
      requesterName: `${user.firstName} ${user.lastName}`.trim(),
      payeeName: draft.payeeName ?? null,
      payeeEmail: draft.payeeEmail ?? null,
      amount: toStored(draft.amount),
      note: draft.note ?? null,
      token: mintToken(),
      destinationAccountId: account.id,
      splitId: draft.splitId ?? null,
      expiresAt: new Date(
        now.getTime() + (draft.expiresInHours ?? DEFAULT_EXPIRY_HOURS) * MS_PER_HOUR,
      ),
      createdAt: now,
    };
  }
}
