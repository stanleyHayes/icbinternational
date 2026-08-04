import { type ClientSession } from 'mongoose';

import { type TransferDestination } from '@reliance/contracts';

/**
 * The name-check's window onto who actually holds an account.
 *
 * Confirmation of Payee is a question addressed to the *receiving* bank, so the answer has
 * to come from outside this module. A port makes that explicit and gives each rail an
 * honest answer:
 *
 * - an internal destination resolves to a real Reliance account and a real holder name;
 * - a destination at another institution has no answer here, and the adapter says `null`
 *   rather than inventing a plausible name. `null` becomes `UNAVAILABLE`, which is a
 *   genuine scheme outcome for a non-participating bank — unlike a fabricated `MATCH`,
 *   which would be a bank telling a customer their payment is safe on no evidence.
 */
export abstract class PayeeNamePort {
  /**
   * The name the destination account is held in, or null when it cannot be established.
   *
   * Null covers three cases that are indistinguishable to the customer and should be:
   * the account does not exist, it exists at a bank that does not answer, or the lookup
   * failed. Distinguishing them would leak whether an account number is real.
   */
  abstract nameFor(
    destination: TransferDestination,
    session?: ClientSession,
  ): Promise<string | null>;
}
