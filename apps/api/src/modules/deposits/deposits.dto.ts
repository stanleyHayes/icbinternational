/**
 * The one request shape the deposits module needs beyond the frozen contract.
 *
 * Placing and breaking a deposit are both described by the contract. Changing whether a
 * deposit renews is not, and a customer must be able to change their mind about that
 * before maturity rather than only at placement. Proposed as a contract addition in
 * `docs/CONTRACT_CHANGES.md`.
 */

import { z } from 'zod';

/** Turning automatic renewal on or off. */
export const setAutoRolloverRequestSchema = z.object({
  autoRollover: z.boolean(),
});
export type SetAutoRolloverRequest = z.infer<typeof setAutoRolloverRequestSchema>;
