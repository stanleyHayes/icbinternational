/**
 * Auth and MFA handlers.
 *
 * `login` answers `MFA_REQUIRED` for any email containing `mfa`, and `AUTHENTICATED`
 * otherwise. A deterministic switch beats a random one: a UI lane building the challenge
 * screen needs to reach it on demand, and a lane building the happy path needs never to.
 */

import { ErrorCode, MfaMethod, routes, UserStatus } from '@reliance/contracts';

import { mockId, opaqueId, times } from '../faker.js';

import {
  acknowledged,
  failure,
  MockMethod,
  raw,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';

/** Any email with this fragment takes the MFA branch. */
const MFA_TRIGGER = 'mfa';
/** Any email with this fragment is treated as locked. */
const LOCKED_TRIGGER = 'locked';
/**
 * The one credential the mock rejects, so a lane can reach the failure state on demand.
 *
 * A fixture value, not a secret — the scanner matches on the shape of the string alone.
 */

const REJECTED_CREDENTIAL = 'wrong-password';

const RECOVERY_CODE_COUNT = 10;
const STEP_UP_MINUTES = 5;
const CHALLENGE_MINUTES = 10;

function emailOf(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as { email?: unknown }).email;
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function passwordOf(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as { password?: unknown }).password;
  return typeof value === 'string' ? value : '';
}

/** Auth and MFA routes. */
export const authHandlers: readonly MockRoute[] = [
  route(MockMethod.POST, routes.auth.register, ({ body, db }) => {
    const email = emailOf(body);
    if (db.users.some((user) => user.email === email)) {
      return failure(ErrorCode.EMAIL_ALREADY_REGISTERED, 'That email is already registered.');
    }

    const registered = {
      ...db.currentUser,
      id: mockId('usr'),
      email,
      emailVerified: false,
      status: UserStatus.PENDING_VERIFICATION,
      createdAt: db.clock.nowIso(),
    };
    db.users.push(registered);
    return resourceCreated(registered);
  }),

  route(MockMethod.POST, routes.auth.verifyEmail, ({ db }) => {
    db.currentUser = { ...db.currentUser, emailVerified: true, status: UserStatus.ACTIVE };
    return acknowledged();
  }),

  route(MockMethod.POST, routes.auth.resendVerification, () => acknowledged()),

  route(MockMethod.POST, routes.auth.login, ({ body, db }) => {
    const email = emailOf(body);

    if (passwordOf(body) === REJECTED_CREDENTIAL) {
      return failure(ErrorCode.INVALID_CREDENTIALS, 'Those details do not match our records.');
    }
    if (email.includes(LOCKED_TRIGGER)) {
      return failure(ErrorCode.ACCOUNT_LOCKED, 'This account is locked. Contact support.');
    }
    if (email.includes(MFA_TRIGGER)) {
      return resourceOk({
        outcome: 'MFA_REQUIRED',
        challengeId: opaqueId(),
        methods: [MfaMethod.TOTP, MfaMethod.SMS],
        expiresAt: db.clock.minutesAhead(CHALLENGE_MINUTES),
      });
    }

    db.currentUser = { ...db.currentUser, lastLoginAt: db.clock.nowIso() };
    return resourceOk({ outcome: 'AUTHENTICATED', user: db.currentUser });
  }),

  route(MockMethod.POST, routes.auth.mfaVerify, ({ body, db }) => {
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : '';
    if (code === '000000') {
      return failure(ErrorCode.MFA_INVALID_CODE, 'That code is not right. Try again.');
    }
    db.currentUser = { ...db.currentUser, lastLoginAt: db.clock.nowIso() };
    return resourceOk(db.currentUser);
  }),

  route(MockMethod.POST, routes.auth.refresh, () => acknowledged()),
  route(MockMethod.POST, routes.auth.logout, () => acknowledged()),
  route(MockMethod.POST, routes.auth.forgotPassword, () => acknowledged()),
  route(MockMethod.POST, routes.auth.resetPassword, () => acknowledged()),

  route(MockMethod.POST, routes.auth.changePassword, ({ body }) => {
    const current =
      typeof body === 'object' && body !== null
        ? (body as { currentPassword?: unknown }).currentPassword
        : '';
    if (current === REJECTED_CREDENTIAL) {
      return failure(ErrorCode.INVALID_CREDENTIALS, 'Your current password is not right.');
    }
    return acknowledged();
  }),

  route(MockMethod.GET, routes.auth.me, ({ db }) => resourceOk(db.currentUser)),

  route(MockMethod.POST, routes.auth.stepUp, ({ db }) =>
    resourceOk({
      token: opaqueId(),
      expiresAt: db.clock.minutesAhead(STEP_UP_MINUTES),
      issuedAt: db.clock.nowIso(),
    }),
  ),

  // --- MFA ----------------------------------------------------------------

  route(MockMethod.POST, routes.mfa.totpEnrol, () =>
    raw({
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUri: 'otpauth://totp/Reliance%20Bank:you?secret=JBSWY3DPEHPK3PXP&issuer=Reliance',
        qrCodeDataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
      },
    }),
  ),

  route(MockMethod.POST, routes.mfa.totpConfirm, ({ db }) => {
    db.currentUser = {
      ...db.currentUser,
      mfaEnabled: true,
      mfaMethods: [...new Set([...db.currentUser.mfaMethods, MfaMethod.TOTP])],
    };
    return acknowledged();
  }),

  route(MockMethod.DELETE, routes.mfa.totpDisable, ({ db }) => {
    db.currentUser = {
      ...db.currentUser,
      mfaMethods: db.currentUser.mfaMethods.filter((method) => method !== MfaMethod.TOTP),
    };
    return acknowledged();
  }),

  route(MockMethod.POST, routes.mfa.recoveryCodes, ({ db }) =>
    raw({
      data: {
        codes: times(RECOVERY_CODE_COUNT, () => opaqueId().slice(0, 10)),
        generatedAt: db.clock.nowIso(),
      },
    }),
  ),

  route(MockMethod.POST, routes.mfa.passkeyRegisterOptions, ({ db }) =>
    resourceOk({
      challengeId: opaqueId(),
      publicKey: { challenge: opaqueId(), rp: { name: 'Reliance Bank', id: 'reliance.test' } },
      expiresAt: db.clock.minutesAhead(CHALLENGE_MINUTES),
    }),
  ),

  route(MockMethod.POST, routes.mfa.passkeyRegisterVerify, ({ body, db }) => {
    const label =
      typeof body === 'object' && body !== null
        ? ((body as { label?: unknown }).label ?? 'New passkey')
        : 'New passkey';
    const passkey = {
      id: opaqueId(),
      label: typeof label === 'string' ? label : 'New passkey',
      deviceLabel: null,
      aaguid: null,
      backedUp: true,
      lastUsedAt: null,
      createdAt: db.clock.nowIso(),
    };
    db.passkeys.push(passkey);
    return resourceOk({ verified: true, passkey });
  }),

  route(MockMethod.POST, routes.mfa.passkeyAuthOptions, ({ db }) =>
    resourceOk({
      challengeId: opaqueId(),
      publicKey: { challenge: opaqueId(), rpId: 'reliance.test' },
      expiresAt: db.clock.minutesAhead(CHALLENGE_MINUTES),
    }),
  ),

  route(MockMethod.POST, routes.mfa.passkeyAuthVerify, ({ db }) =>
    resourceOk({ verified: true, passkey: db.passkeys[0] ?? null }),
  ),

  route(MockMethod.DELETE, routes.mfa.passkey(':id'), ({ db, params }) => {
    const index = db.passkeys.findIndex((passkey) => passkey.id === params.id);
    if (index === -1) return failure(ErrorCode.NOT_FOUND, 'That passkey was not found.');
    db.passkeys.splice(index, 1);
    return acknowledged();
  }),
];
