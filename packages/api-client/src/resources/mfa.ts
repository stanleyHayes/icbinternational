/**
 * Multi-factor enrolment: TOTP, recovery codes and passkeys.
 *
 * The passkey methods are deliberately thin. They hand the server's ceremony options
 * straight to `navigator.credentials` and post the result back untouched — anything this
 * layer "helpfully" reshaped would break the signature the authenticator produced.
 */

import type { z } from 'zod';

import {
  acknowledgedSchema,
  recoveryCodesResponseSchema,
  resource,
  routes,
  type totpConfirmRequestSchema,
  totpEnrolResponseSchema,
  type Acknowledged,
  type Resource,
  type TotpEnrolResponse,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions } from '../core/types.js';
import {
  passkeyCeremonyOptionsSchema,
  passkeyVerificationResultSchema,
  type PasskeyCeremonyOptions,
  type PasskeyVerificationRequest,
  type PasskeyVerificationResult,
} from '../provisional/documents.js';

const ceremonyResource = resource(passkeyCeremonyOptionsSchema);
const verificationResource = resource(passkeyVerificationResultSchema);

type TotpConfirmRequest = z.infer<typeof totpConfirmRequestSchema>;
type RecoveryCodesResponse = z.infer<typeof recoveryCodesResponseSchema>;

/** Builds the `client.mfa` group. */
export function createMfaResource(http: HttpTransport) {
  return {
    /** Starts TOTP enrolment. Returns the secret and a QR payload to scan. */
    enrolTotp: (options?: MutationOptions): Promise<TotpEnrolResponse> =>
      http.post({ ...options, path: routes.mfa.totpEnrol, schema: totpEnrolResponseSchema }),

    /** Confirms TOTP enrolment with a code from the authenticator app. */
    confirmTotp: (body: TotpConfirmRequest, options?: MutationOptions): Promise<Acknowledged> =>
      http.post({ ...options, path: routes.mfa.totpConfirm, body, schema: acknowledgedSchema }),

    /** Removes TOTP. Requires step-up: disabling a factor is itself a sensitive action. */
    disableTotp: (options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({ ...options, path: routes.mfa.totpDisable, schema: acknowledgedSchema }),

    /** Regenerates recovery codes. The previous set stops working immediately. */
    regenerateRecoveryCodes: (options?: MutationOptions): Promise<RecoveryCodesResponse> =>
      http.post({
        ...options,
        path: routes.mfa.recoveryCodes,
        schema: recoveryCodesResponseSchema,
      }),

    /** Ceremony options for registering a new passkey. */
    passkeyRegisterOptions: (
      options?: MutationOptions,
    ): Promise<Resource<PasskeyCeremonyOptions>> =>
      http.post({
        ...options,
        path: routes.mfa.passkeyRegisterOptions,
        schema: ceremonyResource,
      }),

    /** Submits the attestation the authenticator produced during registration. */
    passkeyRegisterVerify: (
      body: PasskeyVerificationRequest,
      options?: MutationOptions,
    ): Promise<Resource<PasskeyVerificationResult>> =>
      http.post({
        ...options,
        path: routes.mfa.passkeyRegisterVerify,
        body,
        schema: verificationResource,
      }),

    /** Ceremony options for signing in with a passkey. */
    passkeyAuthOptions: (options?: MutationOptions): Promise<Resource<PasskeyCeremonyOptions>> =>
      http.post({
        ...options,
        path: routes.mfa.passkeyAuthOptions,
        schema: ceremonyResource,
        allowRefresh: false,
      }),

    /** Submits the assertion the authenticator produced during sign-in. */
    passkeyAuthVerify: (
      body: PasskeyVerificationRequest,
      options?: MutationOptions,
    ): Promise<Resource<PasskeyVerificationResult>> =>
      http.post({
        ...options,
        path: routes.mfa.passkeyAuthVerify,
        body,
        schema: verificationResource,
        allowRefresh: false,
      }),

    /** Removes a registered passkey. */
    removePasskey: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({ ...options, path: routes.mfa.passkey(id), schema: acknowledgedSchema }),
  };
}

/** The `client.mfa` group. */
export type MfaResource = ReturnType<typeof createMfaResource>;
