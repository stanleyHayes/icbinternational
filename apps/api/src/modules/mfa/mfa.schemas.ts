import { z } from 'zod';

/**
 * Request bodies the frozen contract does not yet declare.
 *
 * These mirror the provisional shapes the api-client already sends
 * (`packages/api-client/src/provisional/documents.ts`) so the wire format does not change
 * when the schemas are promoted into `packages/contracts` — the promotion is proposed in
 * this task's handoff notes. `credential` stays an opaque record on purpose: its shape is
 * defined by the WebAuthn spec and the server's WebAuthn library, and re-declaring it here
 * would only create a second source of truth to drift.
 */

/** Upper bound on a passkey nickname — display text, not an identifier. */
const PASSKEY_LABEL_MAX_LENGTH = 60;

/** Body of the passkey register-verify and authenticate-verify calls. */
export const passkeyVerifyBodySchema = z.object({
  /** The signed ceremony token returned by the matching options endpoint. */
  challengeId: z.string().min(1),
  credential: z.record(z.string(), z.unknown()),
  label: z.string().trim().min(1).max(PASSKEY_LABEL_MAX_LENGTH).optional(),
});
export type PasskeyVerifyBody = z.infer<typeof passkeyVerifyBodySchema>;

/** The parsed assertion a step-up or challenge request carries as a JSON string. */
export const passkeyAssertionSchema = z.object({
  challengeId: z.string().min(1),
  credential: z.record(z.string(), z.unknown()),
});
export type PasskeyAssertion = z.infer<typeof passkeyAssertionSchema>;
