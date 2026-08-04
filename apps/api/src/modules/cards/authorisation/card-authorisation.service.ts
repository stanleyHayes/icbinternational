import { Injectable } from '@nestjs/common';

import { DeclineReason } from '@reliance/contracts';

import { type NetworkAuthorisationRequest } from '../../../rails/card-network/index.js';
import { CardService } from '../card.service.js';

import { AuthorisationBookingService } from './authorisation-booking.service.js';
import { CardNetworkGateway } from './authorisation-gateway.service.js';
import { AuthorisationGuardService } from './authorisation-guard.service.js';
import { type AuthorisationDraft } from './authorisation.factory.js';
import { type AuthorisationRecord } from './authorisation.store.js';

/**
 * Answering the card network.
 *
 * One question — "may this payment go ahead?" — and three authorities answer parts of it,
 * in this order:
 *
 * 1. the **scheme**, through `CardNetworkGateway`: is the switch up, and does strong
 *    customer authentication apply?
 * 2. the **card and the account**, through `AuthorisationGuardService`: is the card in a
 *    state to spend, do its controls allow this merchant, and is the money there?
 * 3. the **book**, through `AuthorisationBookingService`: reserve it, or record why not.
 *
 * The order is not arbitrary. Authentication runs before the funds check so a challenge
 * the cardholder abandons never touches their balance, and the money check runs last
 * because it is the only one that can be answered with a smaller approval rather than a
 * refusal.
 */
@Injectable()
export class CardAuthorisationService {
  constructor(
    private readonly cards: CardService,
    private readonly gateway: CardNetworkGateway,
    private readonly guard: AuthorisationGuardService,
    private readonly booking: AuthorisationBookingService,
  ) {}

  /**
   * Authorises, or refuses, one card payment.
   *
   * @returns The authorisation record either way. A decline does not throw — a refusal is
   *   a normal answer the network expects as a response code, not an error condition.
   */
  async authorise(request: NetworkAuthorisationRequest): Promise<AuthorisationRecord> {
    const card = await this.cards.require(request.cardId);
    const answer = this.gateway.open(request, card.scheme);

    const draft: AuthorisationDraft = {
      card,
      request,
      network: answer.context,
      at: answer.at,
      threeDsChallenged: answer.challenged,
      threeDsOutcome: answer.outcome,
    };

    if (!answer.context.issuerReachable) {
      return this.booking.refuse(draft, DeclineReason.ISSUER_UNAVAILABLE);
    }

    if (!this.gateway.authenticated(answer)) {
      return this.booking.refuse(draft, DeclineReason.SUSPECTED_FRAUD);
    }

    return this.settleDecision(draft);
  }

  /** Applies the bank's own rules and books whichever answer they produce. */
  private async settleDecision(draft: AuthorisationDraft): Promise<AuthorisationRecord> {
    const decision = await this.guard.evaluate({
      card: draft.card,
      request: draft.request,
      at: draft.at,
    });

    if (!decision.approved) {
      return this.booking.refuse(draft, decision.declineReason ?? DeclineReason.SUSPECTED_FRAUD);
    }

    return this.booking.approve(draft, decision.amount);
  }
}
