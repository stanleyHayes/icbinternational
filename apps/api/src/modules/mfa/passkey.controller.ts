import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';

import { routes } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsersService } from '../auth/users/index.js';
import { type PasskeyView } from '../devices/device.mapper.js';

import { passkeyVerifyBodySchema, type PasskeyVerifyBody } from './mfa.schemas.js';
import { PasskeyStoreService } from './passkey-store.service.js';
import { PasskeyService, type PasskeyCeremony } from './passkey.service.js';
import { StepUp } from './step-up.decorator.js';

/** What a verify call answers: whether the ceremony passed, and the passkey it used. */
export interface PasskeyVerificationResultView {
  verified: boolean;
  passkey: PasskeyView;
}

/**
 * WebAuthn passkey ceremonies.
 *
 * The controller stays deliberately thin: ceremony options go to the browser's
 * credential API unaltered and the results come back untouched — anything this layer
 * "helpfully" reshaped would break the signature the authenticator produced.
 */
@Controller()
export class PasskeyController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly store: PasskeyStoreService,
    private readonly users: UsersService,
  ) {}

  /** Options for registering a new passkey, excluding the ones already registered. */
  @Post(routes.mfa.passkeyRegisterOptions)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async registerOptions(@CurrentUser() user: AuthenticatedUser): Promise<PasskeyCeremony> {
    const document = await this.users.requireById(user.userId);
    return this.passkeys.registrationOptions(document);
  }

  /** Verifies the attestation and stores the credential. */
  @Post(routes.mfa.passkeyRegisterVerify)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async registerVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(passkeyVerifyBodySchema)) input: PasskeyVerifyBody,
  ): Promise<PasskeyVerificationResultView> {
    const document = await this.users.requireById(user.userId);
    const passkey = await this.passkeys.verifyRegistration(document, input, user.deviceId);
    return { verified: true, passkey };
  }

  /** Options for an authentication ceremony, limited to the customer's own credentials. */
  @Post(routes.mfa.passkeyAuthOptions)
  @UseGuards(JwtAuthGuard)
  async authOptions(@CurrentUser() user: AuthenticatedUser): Promise<PasskeyCeremony> {
    const document = await this.users.requireById(user.userId);
    return this.passkeys.authenticationOptions(document);
  }

  /** Verifies an assertion — the standalone "prove it's you" used by step-up flows. */
  @Post(routes.mfa.passkeyAuthVerify)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async authVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(passkeyVerifyBodySchema)) input: PasskeyVerifyBody,
  ): Promise<PasskeyVerificationResultView> {
    const { passkey } = await this.passkeys.verifyAssertion(user.userId, input);
    return { verified: true, passkey };
  }

  /** Removes a passkey. Step-up gated: dropping a factor is itself a sensitive action. */
  @Delete(routes.mfa.passkey(':id'))
  @StepUp()
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') credentialId: string,
  ): Promise<null> {
    await this.store.removePasskey(user.userId, credentialId);
    return null;
  }
}
