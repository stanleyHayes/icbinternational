import { AccountStatus, ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { type AccountRecord } from './account.store.js';

/**
 * Statuses that refuse money movement, and the contract code each is reported as.
 *
 * Two statuses are notable by their absence:
 *
 * - **`PENDING`** accepts movement, because a pending account's whole purpose is to
 *   receive the opening deposit that activates it. It is credited into life.
 * - **`DORMANT`** accepts movement and is woken by it. Dormancy is bookkeeping, not a
 *   restriction; a customer whose salary arrives after a quiet year should find a live
 *   account, not a rejected credit.
 */
const MOVEMENT_REFUSALS: Partial<Record<AccountStatus, ErrorCode>> = {
  [AccountStatus.CLOSED]: ErrorCode.ACCOUNT_CLOSED,
  [AccountStatus.CLOSING]: ErrorCode.ACCOUNT_CLOSED,
  [AccountStatus.FROZEN]: ErrorCode.ACCOUNT_FROZEN,
};

/**
 * Refuses an account that cannot legally take part in a movement of value.
 *
 * One rule, one place, used by the ledger's balance port before it writes a posting and
 * by the holds module before it reserves funds. A hold and a posting differ in what they
 * do to a balance but not at all in who is allowed to have one, and two copies of that
 * judgement would eventually disagree about a frozen account.
 *
 * A frozen account refuses movement in *both* directions. That is the deliberate reading
 * of a freeze: an inbound credit to an account under investigation is exactly the money
 * an investigator wants stopped at the door.
 *
 * @throws {AppError} `ACCOUNT_CLOSED` or `ACCOUNT_FROZEN`.
 */
export function assertAccountUsable(account: AccountRecord): void {
  const refusal = MOVEMENT_REFUSALS[account.status];
  if (!refusal) return;

  throw new AppError({
    code: refusal,
    message: `This account is ${account.status.toLowerCase()} and cannot be used to move money.`,
    context: { accountId: account.id, status: account.status },
  });
}
