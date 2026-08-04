import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';

/**
 * Proof that the customer re-authenticated recently enough to authorise this payment.
 *
 * A port rather than a guard, for one reason: whether a payment needs step-up is a
 * *pricing* decision made when the quote is built — it depends on the amount and on how
 * well the bank knows the payee — and a guard runs before any of that is known. The
 * decision therefore travels on the quote, and this is what checks it at the moment of
 * execution.
 *
 * Nest resolves this abstract class as its own injection token.
 */
export abstract class StepUpPort {
  /**
   * Confirms `token` is a live step-up proof issued to `userId`.
   *
   * @throws {AppError} `STEP_UP_REQUIRED` when the token is absent, expired, of the wrong
   *   purpose, or belongs to somebody else.
   */
  abstract assertSatisfied(userId: string, token: string | undefined): Promise<void>;
}

/** The single rejection, so every failure mode is indistinguishable from the outside. */
export function stepUpRequired(reason: string): AppError {
  return new AppError({
    code: ErrorCode.STEP_UP_REQUIRED,
    message: 'Confirm it is you before sending this payment.',
    context: { reason },
  });
}
