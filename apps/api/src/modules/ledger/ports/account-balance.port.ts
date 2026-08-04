import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

/**
 * The ledger's window onto customer account balances.
 *
 * The `accounts` collection belongs to the accounts module (B-04), not to the ledger, and
 * the dependency genuinely runs this way round: accounts cannot exist without a ledger,
 * but the ledger must be able to move a balance without importing the module that owns
 * it. A port inverts that edge — the ledger declares what it needs, accounts supplies it.
 *
 * Two implementations exist. `InMemoryAccountBalancePort` backs every test in this module
 * and the seeding fixtures; the accounts module binds the Mongo-backed one at runtime.
 * See `docs/HANDOFFS.md` for the note that asks it to.
 *
 * Nest resolves this abstract class as its own injection token, so a consumer writes
 * `constructor(private readonly balances: AccountBalancePort)` and gets whichever
 * implementation the module graph bound.
 */
export abstract class AccountBalancePort {
  /**
   * Moves an account's `ledgerBalance` and `availableBalance` by the same signed delta.
   *
   * Both move together because a posting is settled money: it is not a hold, and a
   * customer who has been debited must not still be able to spend the amount. Holds move
   * `availableBalance` alone and are the holds module's business, not the ledger's.
   *
   * The session is required for the same reason as `LedgerAccountStore.applyEffect` — a
   * balance update outside the posting transaction can be lost or applied twice.
   */
  abstract applyDelta(input: AccountDeltaInput): Promise<void>;

  /**
   * Throws unless the account can legally receive a posting right now.
   *
   * Checked before anything is written, so a closed or frozen account aborts the
   * transaction before a journal entry exists rather than leaving one to be reversed.
   *
   * @throws {import('../../../common/errors/app-error.js').AppError} with
   *   `ACCOUNT_NOT_FOUND`, `ACCOUNT_CLOSED` or `ACCOUNT_FROZEN`.
   */
  abstract assertPostable(accountId: string, session: ClientSession): Promise<void>;

  /**
   * The stored `ledgerBalance`, or null if the account is unknown.
   *
   * Read-only, and used by `LedgerVerifierService` to diff the stored projection against
   * a balance replayed from postings. Without it the verifier could prove the general
   * ledger self-consistent while every customer balance had silently drifted.
   */
  abstract currentBalance(accountId: string, session?: ClientSession): Promise<Money | null>;
}

export interface AccountDeltaInput {
  readonly accountId: string;
  /** Signed: negative debits the customer, positive credits them. */
  readonly delta: Money;
  readonly session: ClientSession;
}
