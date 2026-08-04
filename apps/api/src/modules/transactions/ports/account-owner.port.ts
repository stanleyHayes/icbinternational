import { type ClientSession } from 'mongoose';

/**
 * The projection's window onto who owns an account.
 *
 * The `accounts` collection belongs to the accounts module (B-04), and the dependency
 * genuinely runs this way round: a transaction row cannot exist without an account, but
 * this module must be able to stamp `userId` on a row without importing the module that
 * owns accounts. A port inverts that edge — transactions declare what they need, accounts
 * supplies it.
 *
 * The owner is denormalised onto every row rather than resolved at read time because the
 * "everything across my accounts" feed is otherwise a lookup of every account the
 * customer holds followed by an `$in` over a list that grows with their relationship.
 * Accounts do not change hands, so the denormalised copy has no update path to keep
 * consistent — see `docs/HANDOFFS.md` if that ever stops being true.
 *
 * Nest resolves this abstract class as its own injection token, so a consumer writes
 * `constructor(private readonly owners: AccountOwnerPort)` and gets whichever
 * implementation the module graph bound.
 */
export abstract class AccountOwnerPort {
  /**
   * The `usr_` id that owns `accountId`, or null when the account is unknown.
   *
   * Null rather than a throw because the caller — the projector — is running inside the
   * posting transaction and has a better answer for an unknown account than aborting a
   * booked ledger entry: skip the projection and log loudly. The money is already
   * correct; only the human view of it is missing.
   */
  abstract ownerOf(accountId: string, session?: ClientSession): Promise<string | null>;
}
