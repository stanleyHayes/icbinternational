import { Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/config.service.js';
import { type UserDocument } from '../auth/users/index.js';
import { type PasskeyView, toPasskeyView } from '../devices/device.mapper.js';
import { type DevicePasskey } from '../devices/device.schema.js';

import { passkeyVerificationFailed } from './mfa.errors.js';
import { PasskeyStoreService, type StoredCredential } from './passkey-store.service.js';
import { CeremonyPurpose, WebAuthnChallengeService } from './webauthn-challenge.service.js';

/** Ceremony options for the browser's credential API, plus the token that closes the loop. */
export interface PasskeyCeremony {
  challengeId: string;
  publicKey: Record<string, unknown>;
  expiresAt: string;
}

/** The credential and optional nickname a verify call carries. */
export interface PasskeyVerifyInput {
  challengeId: string;
  credential: Record<string, unknown>;
  label?: string;
}

const DEFAULT_PASSKEY_LABEL = 'New passkey';

/**
 * WebAuthn passkeys: registration and authentication ceremonies.
 *
 * Two design choices worth stating. **Attestation is `none`**: which authenticator a
 * customer owns is theirs to know, and nothing here needs a hardware vendor's certificate
 * chain to trust a signature key the authenticator just minted. **The credential id is
 * the passkey's public id**: the authenticator already mints it unique and unguessable,
 * so a second identifier would add a lookup without adding security.
 *
 * The relying-party id is the cookie domain and the accepted origins are the three front
 * ends — a passkey registered on the client dashboard also works on the admin console,
 * which is what a shared-authenticator customer expects.
 */
@Injectable()
export class PasskeyService {
  constructor(
    private readonly store: PasskeyStoreService,
    private readonly ceremonies: WebAuthnChallengeService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  /** Options for `navigator.credentials.create`, excluding credentials already registered. */
  async registrationOptions(user: UserDocument): Promise<PasskeyCeremony> {
    this.assertEnabled();

    const existing = await this.store.listCredentials(user.id);
    const options = await generateRegistrationOptions({
      rpName: this.config.bank.name,
      rpID: this.config.cookies.domain,
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`,
      attestationType: 'none',
      excludeCredentials: existing.map(descriptorOf),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    return this.ceremony(user.id, CeremonyPurpose.REGISTER, options.challenge, options);
  }

  /**
   * Verifies an attestation and stores the credential.
   *
   * @throws {AppError} `PASSKEY_VERIFICATION_FAILED` for a failed or tampered ceremony.
   */
  async verifyRegistration(
    user: UserDocument,
    input: PasskeyVerifyInput,
    deviceId: string | null,
  ): Promise<PasskeyView> {
    this.assertEnabled();
    const challenge = this.ceremonies.assertValid(
      CeremonyPurpose.REGISTER,
      input.challengeId,
      user.id,
    );

    const result = await this.tryVerify(() =>
      verifyRegistrationResponse({
        response: input.credential as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: this.config.allowedOrigins,
        expectedRPID: this.config.cookies.domain,
      }),
    );
    if (!result.verified || !result.registrationInfo) throw passkeyVerificationFailed();

    const passkey = this.buildPasskey(result.registrationInfo, input.label);
    return this.store.storePasskey(user.id, deviceId, passkey);
  }

  /** Options for `navigator.credentials.get`, limited to the customer's own credentials. */
  async authenticationOptions(user: UserDocument): Promise<PasskeyCeremony> {
    this.assertEnabled();

    const existing = await this.store.listCredentials(user.id);
    const options = await generateAuthenticationOptions({
      rpID: this.config.cookies.domain,
      allowCredentials: existing.map(descriptorOf),
      userVerification: 'preferred',
    });

    return this.ceremony(user.id, CeremonyPurpose.AUTHENTICATE, options.challenge, options);
  }

  /**
   * Verifies an assertion against the stored credential and advances its sign counter.
   *
   * @returns The verified passkey and the device it lives on, so a caller establishing a
   *   session can bind it to the right device.
   * @throws {AppError} `PASSKEY_VERIFICATION_FAILED` for an unknown credential, a bad
   *   signature, or a counter that did not advance — the clone signal.
   */
  async verifyAssertion(
    userId: string,
    input: PasskeyVerifyInput,
  ): Promise<{ passkey: PasskeyView; deviceId: string }> {
    this.assertEnabled();
    const challenge = this.ceremonies.assertValid(
      CeremonyPurpose.AUTHENTICATE,
      input.challengeId,
      userId,
    );

    const stored = await this.store.findCredential(userId, credentialIdOf(input.credential));
    if (!stored) throw passkeyVerificationFailed();

    const result = await this.tryVerify(() =>
      verifyAuthenticationResponse({
        response: input.credential as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: this.config.allowedOrigins,
        expectedRPID: this.config.cookies.domain,
        credential: {
          id: stored.passkey.credentialId,
          publicKey: Buffer.from(stored.passkey.publicKey, 'base64url'),
          counter: stored.passkey.counter,
          transports: stored.passkey.transports as AuthenticatorTransportFuture[],
        },
      }),
    );
    if (!result.verified) throw passkeyVerificationFailed();

    await this.store.recordUse(
      stored.device.id,
      stored.passkey.credentialId,
      result.authenticationInfo.newCounter,
      this.clock.now(),
    );

    return {
      passkey: toPasskeyView(stored.passkey, stored.device.label),
      deviceId: stored.device.id,
    };
  }

  private ceremony(
    userId: string,
    purpose: CeremonyPurpose,
    challenge: string,
    publicKey: object,
  ): PasskeyCeremony {
    const issued = this.ceremonies.issue(userId, purpose, challenge);
    // The generated options are a plain JSON document for the browser; the library's
    // interfaces simply do not declare the index signature the contract shape uses.
    const payload = publicKey as unknown as Record<string, unknown>;
    return {
      challengeId: issued.challengeId,
      publicKey: payload,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  private buildPasskey(
    info: {
      credential: { id: string; publicKey: Uint8Array; counter: number };
      aaguid: string;
      credentialBackedUp: boolean;
    },
    label: string | undefined,
  ): DevicePasskey {
    return {
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
      counter: info.credential.counter,
      label: label ?? DEFAULT_PASSKEY_LABEL,
      aaguid: info.aaguid,
      transports: [],
      backedUp: info.credentialBackedUp,
      createdAt: this.clock.now(),
      lastUsedAt: null,
    };
  }

  /** A WebAuthn library failure and a failed verification are the same answer to the caller. */
  private async tryVerify<T>(verify: () => Promise<T>): Promise<T> {
    try {
      return await verify();
    } catch (error) {
      throw new AppError({
        code: ErrorCode.PASSKEY_VERIFICATION_FAILED,
        message: 'We could not verify that passkey. Try again.',
        cause: error,
      });
    }
  }

  private assertEnabled(): void {
    if (this.config.features.passkeys) return;
    throw new AppError({
      code: ErrorCode.FEATURE_DISABLED,
      message: 'Passkeys are not available right now.',
    });
  }
}

/** The credential id an assertion names, without trusting the rest of the shape yet. */
function credentialIdOf(credential: Record<string, unknown>): string {
  const id = credential['id'];
  if (typeof id !== 'string' || id.length === 0) throw passkeyVerificationFailed();
  return id;
}

/** The allow/exclude list entry the options generators expect for one stored credential. */
interface CredentialDescriptor {
  id: string;
  transports?: AuthenticatorTransportFuture[];
}

/** Maps a stored credential onto its options-generator descriptor. */
function descriptorOf(stored: StoredCredential): CredentialDescriptor {
  return {
    id: stored.passkey.credentialId,
    transports: stored.passkey.transports as AuthenticatorTransportFuture[],
  };
}
