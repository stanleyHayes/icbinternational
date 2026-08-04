import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../../config/config.service.js';
import { type NetworkAuthorisationRequest } from '../../../rails/card-network/index.js';
import { AccountService, computeAvailability } from '../../accounts/index.js';
import { type CardRecord } from '../card.store.js';
import { controlDecline, type ControlContext } from '../controls/control-rules.js';
import { CardPinService } from '../lifecycle/card-pin.service.js';

import { decide, declined, type AuthorisationDecision } from './authorisation-decision.js';
import { SpendWindowReader } from './spend-window.reader.js';

/** Channels at which a terminal captures a PIN, and at which its absence is a failure. */
const PIN_CHANNELS: ReadonlySet<string> = new Set(['ATM', 'CHIP']);

/**
 * The bank's own answer to an authorisation, as opposed to the scheme's.
 *
 * Gathers the three facts the decision needs — what the card allows, what the customer has
 * already spent, what is actually in the account — and hands them to the pure
 * {@link decide}. Nothing here decides anything itself, which is what keeps the rules in
 * a file that can be tested without a database.
 */
@Injectable()
export class AuthorisationGuardService {
  constructor(
    private readonly accounts: AccountService,
    private readonly windows: SpendWindowReader,
    private readonly pins: CardPinService,
    private readonly config: AppConfigService,
  ) {}

  /** Approve, decline, or approve for less. */
  async evaluate(input: {
    card: CardRecord;
    request: NetworkAuthorisationRequest;
    at: Date;
  }): Promise<AuthorisationDecision> {
    const { card, request } = input;
    const context = this.contextFor(request, input.at);

    // The card's own settings are checked before the PIN, and the PIN is only *read* if
    // they pass. Verifying it earlier would count a failed attempt against a card that
    // was going to be refused anyway — so three taps of a frozen card at a cash machine
    // would lock the customer's PIN for an hour on top of the freeze they can undo.
    const refusal = controlDecline(card, context);
    if (refusal) return declined(request.amount, refusal);

    const account = await this.accounts.require(card.accountId);

    return decide({
      card,
      context,
      amount: request.amount,
      available: computeAvailability(account).available,
      windows: await this.windows.read(card.id),
      partialApprovalAllowed: request.partialApprovalAllowed,
      pinFailed: await this.pinFailed(card, request),
    });
  }

  private contextFor(request: NetworkAuthorisationRequest, at: Date): ControlContext {
    return {
      channel: request.channel,
      merchantId: request.merchantId,
      merchantCountry: request.merchantCountry,
      mcc: request.mcc,
      homeCountry: this.config.bank.country,
      at,
    };
  }

  /**
   * Whether the terminal's PIN entry failed.
   *
   * A card with no PIN is never asked for one — a virtual card has never been near a
   * terminal. A PIN channel on a card that *does* have one, with nothing presented, is a
   * failure rather than a pass: chip traffic arriving without a PIN is precisely what a
   * cloned stripe looks like when it is replayed through a fallback terminal.
   */
  private async pinFailed(
    card: CardRecord,
    request: NetworkAuthorisationRequest,
  ): Promise<boolean> {
    if (!PIN_CHANNELS.has(request.channel) || card.pinHash === null) return false;
    if (!request.pin) return true;

    return !(await this.pins.matches(card, request.pin));
  }
}
