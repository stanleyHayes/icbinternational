/**
 * Authentication.
 *
 * No method here returns a token. Login sets httpOnly cookies and answers with the
 * *user*; `stepUp` is the one exception, and it returns a short-lived grant precisely
 * because that token belongs in a header on one subsequent call rather than in a cookie
 * attached to every call.
 */

import type { z } from 'zod';

import {
  acknowledgedSchema,
  type changePasswordRequestSchema,
  type forgotPasswordRequestSchema,
  loginResultSchema,
  resource,
  type resetPasswordRequestSchema,
  routes,
  userSchema,
  type verifyEmailRequestSchema,
  type Acknowledged,
  type LoginRequest,
  type LoginResult,
  type MfaVerifyRequest,
  type RegisterRequest,
  type Resource,
  type StepUpRequest,
  type User,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import { stepUpGrantSchema, type StepUpGrant } from '../provisional/documents.js';

const userResource = resource(userSchema);
const loginResource = resource(loginResultSchema);
const stepUpResource = resource(stepUpGrantSchema);

type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Builds the `client.auth` group. */
export function createAuthResource(http: HttpTransport) {
  return {
    /** Creates an account. The user is `PENDING_VERIFICATION` until the email is confirmed. */
    register: (body: RegisterRequest, options?: MutationOptions): Promise<Resource<User>> =>
      http.post({ ...options, path: routes.auth.register, body, schema: userResource }),

    /** Confirms an email address from the token in the verification link. */
    verifyEmail: (body: VerifyEmailRequest, options?: MutationOptions): Promise<Acknowledged> =>
      http.post({ ...options, path: routes.auth.verifyEmail, body, schema: acknowledgedSchema }),

    /** Sends a fresh verification email. Rate limited server-side. */
    resendVerification: (options?: MutationOptions): Promise<Acknowledged> =>
      http.post({ ...options, path: routes.auth.resendVerification, schema: acknowledgedSchema }),

    /**
     * Authenticates. Answers either `AUTHENTICATED` with the user, or `MFA_REQUIRED`
     * with a challenge — handle both branches, the contract makes that a type error to
     * forget.
     *
     * `allowRefresh` is off: a 401 here means bad credentials, and refreshing a session
     * the user does not yet have would be nonsense.
     */
    login: (body: LoginRequest, options?: MutationOptions): Promise<Resource<LoginResult>> =>
      http.post({
        ...options,
        path: routes.auth.login,
        body,
        schema: loginResource,
        allowRefresh: false,
      }),

    /** Completes an MFA challenge and establishes the session. */
    verifyMfa: (body: MfaVerifyRequest, options?: MutationOptions): Promise<Resource<User>> =>
      http.post({
        ...options,
        path: routes.auth.mfaVerify,
        body,
        schema: userResource,
        allowRefresh: false,
      }),

    /**
     * Rotates the session cookies by hand.
     *
     * Rarely needed: the transport refreshes automatically on a 401 and shares a single
     * in-flight attempt across concurrent requests. Calling this directly bypasses that
     * coordination, so prefer letting a real request trigger it.
     */
    refresh: (options?: MutationOptions): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.auth.refresh,
        schema: acknowledgedSchema,
        allowRefresh: false,
      }),

    /** Ends the current session and clears the cookies. */
    logout: (options?: MutationOptions): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.auth.logout,
        schema: acknowledgedSchema,
        allowRefresh: false,
      }),

    /** Starts a password reset. Always acknowledges, so it cannot enumerate accounts. */
    forgotPassword: (
      body: ForgotPasswordRequest,
      options?: MutationOptions,
    ): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.auth.forgotPassword,
        body,
        schema: acknowledgedSchema,
        allowRefresh: false,
      }),

    /** Completes a password reset from the emailed token. */
    resetPassword: (body: ResetPasswordRequest, options?: MutationOptions): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.auth.resetPassword,
        body,
        schema: acknowledgedSchema,
        allowRefresh: false,
      }),

    /** Changes the password of the signed-in user. Revokes every other session. */
    changePassword: (
      body: ChangePasswordRequest,
      options?: MutationOptions,
    ): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.auth.changePassword,
        body,
        schema: acknowledgedSchema,
      }),

    /** The signed-in user. The canonical "am I logged in?" call. */
    me: (options?: QueryOptions): Promise<Resource<User>> =>
      http.get({ ...options, path: routes.auth.me, schema: userResource }),

    /**
     * Re-authenticates for a sensitive action. Pass the resulting token to the next call
     * via {@link withStepUpToken}; it is valid for one short, server-defined window.
     */
    stepUp: (body: StepUpRequest, options?: MutationOptions): Promise<Resource<StepUpGrant>> =>
      http.post({ ...options, path: routes.auth.stepUp, body, schema: stepUpResource }),
  };
}

/** The `client.auth` group. */
export type AuthResource = ReturnType<typeof createAuthResource>;
