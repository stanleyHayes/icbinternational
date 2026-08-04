import { Injectable } from '@nestjs/common';

import { MfaMethod } from '@reliance/contracts';

import { type RequestOrigin } from '../auth/auth.types.js';
import { TokenService } from '../auth/token.service.js';
import { type UserDocument } from '../auth/users/index.js';

import { type DeviceDocument } from './device.schema.js';
import { DeviceService } from './device.service.js';

/** The gate's answer: proceed to a session, or stop and answer a second factor first. */
export type LoginGateDecision =
  | { kind: typeof LoginGateKind.PROCEED; deviceId: string }
  | {
      kind: typeof LoginGateKind.CHALLENGE;
      challengeId: string;
      methods: MfaMethod[];
      expiresAt: string;
    };

export const LoginGateKind = {
  PROCEED: 'PROCEED',
  CHALLENGE: 'CHALLENGE',
} as const;

/** What a verified login knows about the person and the machine they arrived from. */
export interface LoginGateInput {
  /** Loaded with credentials (`findCredentialsByEmail`) — the MFA fields are `select: false` otherwise. */
  user: UserDocument;
  fingerprint: string;
  rememberDevice: boolean;
  origin: RequestOrigin;
}

/**
 * The decision between "issue a session" and "answer a second factor first".
 *
 * Called by `LoginService` after the password has verified. Three rules, in order:
 * a blocked device is refused outright (the account owner's standing instruction beats a
 * correct password); an enrolled account on an untrusted device gets a challenge naming
 * the factors it can answer; everything else proceeds, now with a recognised device to
 * bind the session to.
 *
 * Device trust only ever *removes* the challenge — a copied fingerprint can skip a
 * second-factor prompt at worst, never forge a session — which is why the client-supplied
 * fingerprint is safe to consult here.
 */
@Injectable()
export class LoginMfaGate {
  constructor(
    private readonly devices: DeviceService,
    private readonly tokens: TokenService,
  ) {}

  /** Applies the device and enrolment checks and either clears or challenges the login. */
  async decide(input: LoginGateInput): Promise<LoginGateDecision> {
    const { device } = await this.devices.recognise({
      userId: input.user.id,
      fingerprint: input.fingerprint,
      origin: input.origin,
    });
    this.devices.assertNotBlocked(device);

    if (!this.mustChallenge(input.user, device)) {
      return { kind: LoginGateKind.PROCEED, deviceId: device.id };
    }

    const challengeId = await this.tokens.signChallenge({
      userId: input.user.id,
      deviceId: device.id,
      remember: input.rememberDevice,
    });

    return {
      kind: LoginGateKind.CHALLENGE,
      challengeId,
      methods: this.methodsFor(input.user),
      expiresAt: this.tokens.challengeExpiresAt().toISOString(),
    };
  }

  private mustChallenge(user: UserDocument, device: DeviceDocument): boolean {
    if (!user.mfa.enrolled) return false;
    return !this.devices.isTrusted(device);
  }

  /**
   * The factors the customer can actually answer with.
   *
   * Recovery codes are offered exactly while unspent ones remain; a passkey is not listed
   * because the login-challenge contract cannot carry an assertion yet (see this task's
   * contract proposal) — passkeys serve step-up and standalone verification instead.
   */
  private methodsFor(user: UserDocument): MfaMethod[] {
    const methods = user.mfa.methods.filter((method) => method !== MfaMethod.PASSKEY);
    if (user.mfa.recoveryCodeHashes.length > 0 && !methods.includes(MfaMethod.RECOVERY_CODE)) {
      methods.push(MfaMethod.RECOVERY_CODE);
    }
    return methods;
  }
}
