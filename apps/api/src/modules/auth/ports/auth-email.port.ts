/**
 * Outbound email the auth flow depends on.
 *
 * A port rather than a direct Resend call for two reasons: tests must never reach the
 * provider (ADR-004), and the notifications workstream (H-02/H-03) owns the real, branded,
 * Resend-backed implementation. This module ships a logging adapter so it is never blocked
 * on that work; swapping in the real one is a one-line provider change in `auth.module.ts`.
 */

/** Everything an auth email needs. `token` is the raw secret to embed in the link. */
export interface AuthEmail {
  to: string;
  firstName: string;
  token: string;
}

/** The two emails authentication sends. */
export interface AuthEmailPort {
  sendVerificationEmail(message: AuthEmail): Promise<void>;
  sendPasswordResetEmail(message: AuthEmail): Promise<void>;
}

/**
 * Injection token for {@link AuthEmailPort}.
 *
 * A symbol, not the class, so the logging adapter and the future Resend adapter are
 * interchangeable without a shared base class.
 */
export const AUTH_EMAIL_PORT = Symbol('AUTH_EMAIL_PORT');
