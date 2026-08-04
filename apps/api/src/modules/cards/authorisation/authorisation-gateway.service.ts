import { Injectable } from '@nestjs/common';

import { type CardScheme } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import {
  CardNetworkSimulator,
  ThreeDsOutcome,
  ThreeDsRequirement,
  type NetworkAuthorisationContext,
  type NetworkAuthorisationRequest,
} from '../../../rails/card-network/index.js';

import { networkKeyFor } from './authorisation.factory.js';

/** What the scheme contributed to one attempt, and when it was asked. */
export interface NetworkAnswer {
  readonly context: NetworkAuthorisationContext;
  readonly at: Date;
  readonly challenged: boolean;
  /** Null when no challenge was raised. */
  readonly outcome: ThreeDsOutcome | null;
}

/**
 * The bank's side of the conversation with the card scheme.
 *
 * A thin seam over the rail, and it earns its place twice. It is the only thing in the
 * cards lane that reads the clock *and* the network, so the authorisation path can take
 * both as one collaborator; and it keeps `networkKeyFor` — the choice that makes a
 * scenario replayable — beside the call that depends on it.
 */
@Injectable()
export class CardNetworkGateway {
  constructor(
    private readonly network: CardNetworkSimulator,
    private readonly clock: ClockService,
  ) {}

  /**
   * Opens an authorisation with the scheme and runs any challenge it demands.
   *
   * The challenge happens here rather than in the caller because whether one is needed
   * and how it ends are both the scheme's business, and a caller that had to remember to
   * ask twice would eventually forget on one path.
   */
  open(request: NetworkAuthorisationRequest, scheme: CardScheme): NetworkAnswer {
    const at = this.clock.now();
    const context = this.network.authorisationContext({
      key: networkKeyFor(request, at),
      request,
      scheme,
      at,
    });

    if (context.threeDs !== ThreeDsRequirement.CHALLENGE) {
      return { context, at, challenged: false, outcome: null };
    }

    return {
      context,
      at,
      challenged: true,
      outcome: this.network.resolveChallenge(context.networkReference),
    };
  }

  /** Whether a challenge, if one was raised, ended with the cardholder authenticated. */
  authenticated(answer: NetworkAnswer): boolean {
    return !answer.challenged || answer.outcome === ThreeDsOutcome.PASSED;
  }

  /** The presentment reference an acquirer quotes when it clears an authorisation. */
  clearingReference(authorisationId: string): string {
    return this.network.clearingReference(authorisationId);
  }
}
