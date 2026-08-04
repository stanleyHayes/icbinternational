import { z } from 'zod';

import { emailSchema, otpSchema } from '@reliance/contracts';

/**
 * The staff sign-in body.
 *
 * Assembled from the contract primitives rather than from fresh rules, so what the console
 * sends (`AdminLoginRequest`) and what this endpoint accepts cannot drift apart — a
 * six-digit code is six digits in exactly one place.
 *
 * Both factors arrive in one request. The screen collects them in two steps because that
 * is how staff expect to be asked, but answering the password separately would tell an
 * attacker it was right before they had a code to try.
 */
export const adminLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  totpCode: otpSchema,
});

export type AdminLoginBody = z.infer<typeof adminLoginRequestSchema>;
