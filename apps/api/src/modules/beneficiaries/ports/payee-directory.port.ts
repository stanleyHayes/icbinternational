import { type ClientSession } from 'mongoose';

/**
 * Resolution of the two human-friendly ways to name a Reliance customer.
 *
 * An account number is a banking identifier and lives on the account. An email address and
 * an `@handle` are *identity* identifiers and live with the customer, in a module this one
 * must not import wholesale — so the need is declared here and satisfied by an adapter.
 *
 * Nest resolves this abstract class as its own injection token, so a consumer writes
 * `constructor(private readonly directory: PayeeDirectoryPort)` and gets whichever
 * implementation the module graph bound.
 */
export abstract class PayeeDirectoryPort {
  /** The `usr_` id registered to `email`, or null. Addresses are compared lower-cased. */
  abstract userByEmail(email: string, session?: ClientSession): Promise<string | null>;

  /**
   * The `usr_` id that claimed `handle`, or null.
   *
   * Handles are a public alias — the thing a customer puts in a group chat — and are
   * therefore a claimable, revocable namespace rather than a property of the person. The
   * user document has no field for one yet; see `docs/HANDOFFS.md`.
   */
  abstract userByHandle(handle: string, session?: ClientSession): Promise<string | null>;

  /** The customer's display name, for Confirmation of Payee. Null when unknown. */
  abstract displayNameOf(userId: string, session?: ClientSession): Promise<string | null>;
}
