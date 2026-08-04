import { Injectable, Logger } from '@nestjs/common';

import { CardStatus, type CardSensitiveDetails } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { SENSITIVE_DETAILS_TTL_SECONDS } from '../card.constants.js';
import { cardStateConflict } from '../card.errors.js';
import { toIso } from '../card.mapper.js';
import { type CardRecord } from '../card.store.js';

import { PanTokeniser } from './pan-tokeniser.js';

/** Statuses whose number is still worth showing. A cancelled card's is not. */
const REVEALABLE_STATUSES: readonly CardStatus[] = [
  CardStatus.ACTIVE,
  CardStatus.FROZEN,
  CardStatus.INACTIVE,
  CardStatus.DELIVERED,
];

/**
 * Showing the customer their own card number.
 *
 * This is the only place in the system that produces a PAN, and everything about it is
 * arranged to keep that true:
 *
 * - the number is **derived**, not read, so there was never a stored copy to leak;
 * - the payload carries its own expiry and the client counts down against it, so a panel
 *   left open on a shared screen blanks itself;
 * - the route in front of it is `@StepUp()`, so a stolen session is not enough;
 * - **nothing here logs the payload**, and the log line below deliberately names only the
 *   card id. A reveal is worth recording; what was revealed is not.
 */
@Injectable()
export class CardSensitiveService {
  private readonly logger = new Logger(CardSensitiveService.name);

  constructor(
    private readonly tokeniser: PanTokeniser,
    private readonly clock: ClockService,
  ) {}

  /**
   * The card's number, security code and expiry, valid for a short window.
   *
   * @throws {AppError} `CONFLICT` for a card whose number is of no further use.
   */
  reveal(card: CardRecord): CardSensitiveDetails {
    assertRevealable(card);

    const details = this.tokeniser.reveal({
      panToken: card.panToken,
      bin: card.bin,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
    });

    this.logger.log(`Card details revealed for ${card.id}`);

    return {
      data: {
        pan: details.pan,
        cvv: details.cvv,
        expiry: details.expiry,
        cardholderName: card.cardholderName,
        validUntil: toIso(this.clock.inSeconds(SENSITIVE_DETAILS_TTL_SECONDS)),
      },
    };
  }
}

function assertRevealable(card: CardRecord): void {
  if (REVEALABLE_STATUSES.includes(card.status)) return;

  throw cardStateConflict({
    cardId: card.id,
    status: card.status,
    message: 'This card is no longer in use, so we cannot show its details.',
  });
}
