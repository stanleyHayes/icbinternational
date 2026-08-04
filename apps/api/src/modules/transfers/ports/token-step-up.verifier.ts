import { Injectable } from '@nestjs/common';

import { TokenService } from '../../auth/token.service.js';

import { StepUpPort, stepUpRequired } from './step-up.port.js';

/**
 * {@link StepUpPort} over the real step-up JWT the auth module issues.
 *
 * `TokenService.verifyStepUp` checks the signature, the expiry *and* the `typ` claim, so a
 * thirty-day refresh token cannot be presented as a five-minute step-up proof. What it
 * cannot check is that the proof belongs to the customer making the payment — a valid
 * step-up token minted for another account is still a valid signature — so the subject is
 * compared here. Skipping that comparison would let anyone who can obtain *a* step-up
 * token authorise *any* customer's large payment.
 */
@Injectable()
export class TokenStepUpVerifier extends StepUpPort {
  constructor(private readonly tokens: TokenService) {
    super();
  }

  override async assertSatisfied(userId: string, token: string | undefined): Promise<void> {
    if (!token) throw stepUpRequired('no step-up proof was presented');

    const claims = await this.tokens.verifyStepUp(token).catch(() => null);
    if (!claims) throw stepUpRequired('the step-up proof was rejected');
    if (claims.sub !== userId) throw stepUpRequired('the step-up proof belongs to another user');
  }
}
