import { Injectable, Logger } from '@nestjs/common';

import { CardStatus, ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AUTHORISATION_EXPIRY_BATCH } from '../card.constants.js';
import { cardChangedUnderneath, cardStateConflict } from '../card.errors.js';
import { CardStore, type CardRecord } from '../card.store.js';

import { CardPinService } from './card-pin.service.js';
import { ACTIVATABLE_STATUSES, CANCELLABLE_STATUSES, canTransition } from './card-status.rules.js';

/**
 * What happens to a card between arriving and being retired.
 *
 * Every state change goes through {@link move}, which writes conditionally on the status
 * the caller believed the card was in. That single guard is the whole concurrency story:
 * a freeze racing an authorisation, two devices cancelling at once, a delivery sweep
 * meeting a customer's report of non-delivery — in each case exactly one write lands and
 * the loser is told the card moved rather than silently overwriting somebody's decision.
 *
 * Replacement and reporting live in `CardReplacementService`, because both end by issuing
 * a second card and that pulls in the issuing lane; keeping them apart leaves this file
 * about one card's own life.
 */
@Injectable()
export class CardLifecycleService {
  private readonly logger = new Logger(CardLifecycleService.name);

  constructor(
    private readonly cards: CardStore,
    private readonly pins: CardPinService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Activates a delivered card.
   *
   * Two proofs are required and both matter. The **last four digits** prove the customer
   * is holding the physical card rather than acting on a letter that said one was coming;
   * the **PIN** they choose is set in the same step, so a card is never simultaneously
   * live and PIN-less.
   *
   * @throws {AppError} `CONFLICT` when the card is not awaiting activation;
   *   `VALIDATION_FAILED` when the digits do not match the card on file.
   */
  async activate(input: { card: CardRecord; last4: string; pin: string }): Promise<CardRecord> {
    assertAwaitingActivation(input.card);
    assertLast4Matches(input.card, input.last4);

    const withPin = await this.pins.set({ card: input.card, pin: input.pin });

    return this.move({
      card: withPin,
      to: CardStatus.ACTIVE,
      fields: { activatedAt: this.clock.now() },
      from: ACTIVATABLE_STATUSES,
    });
  }

  /**
   * Freezes a card.
   *
   * Instant, reversible and the right answer to "I cannot find my card". A customer who
   * has mislaid a card in the house should not have to cancel it, and one who has lost it
   * for good can report it afterwards without having lost anything by freezing first.
   */
  async freeze(card: CardRecord): Promise<CardRecord> {
    return this.move({ card, to: CardStatus.FROZEN, fields: {}, from: [CardStatus.ACTIVE] });
  }

  /** Unfreezes a card the customer froze. */
  async unfreeze(card: CardRecord): Promise<CardRecord> {
    return this.move({ card, to: CardStatus.ACTIVE, fields: {}, from: [CardStatus.FROZEN] });
  }

  /**
   * Cancels a card permanently.
   *
   * There is no route back. Cancel is the customer saying "I will never use this card
   * again", and a cancellation that could be undone is a freeze wearing the wrong name.
   */
  async cancel(card: CardRecord, reason: string): Promise<CardRecord> {
    return this.move({
      card,
      to: CardStatus.CANCELLED,
      fields: { cancelledAt: this.clock.now(), reportedReason: reason },
      from: CANCELLABLE_STATUSES,
    });
  }

  /**
   * Retires every card whose printed expiry has passed.
   *
   * Each in its own write, so one card locked by a concurrent freeze cannot stop the
   * sweep retiring everybody else's. Cards that lose the race are skipped rather than
   * retried — something else already moved them out of circulation, which is the outcome
   * the sweep wanted.
   *
   * @returns How many cards this pass expired.
   */
  async expireDue(limit: number = AUTHORISATION_EXPIRY_BATCH): Promise<number> {
    const due = await this.cards.listExpired({ asOf: this.clock.now(), limit });
    let expired = 0;

    for (const card of due) {
      const patched = await this.cards.patch({
        cardId: card.id,
        fields: { status: CardStatus.EXPIRED },
        expectedStatuses: EXPIRABLE_STATUSES,
      });
      if (patched) expired += 1;
    }

    if (expired > 0) this.logger.log(`Expired ${expired} cards`);
    return expired;
  }

  /**
   * Applies a status change, conditionally on where the card was.
   *
   * @throws {AppError} `PRECONDITION_FAILED` when the transition is not one the lifecycle
   *   allows at all; `CONFLICT` when it is allowed but the card has since moved.
   */
  async move(input: {
    card: CardRecord;
    to: CardStatus;
    fields: Parameters<CardStore['patch']>[0]['fields'];
    from: readonly CardStatus[];
  }): Promise<CardRecord> {
    assertTransitionAllowed(input.card, input.to);

    const patched = await this.cards.patch({
      cardId: input.card.id,
      fields: { ...input.fields, status: input.to },
      expectedStatuses: input.from,
    });

    if (!patched) throw cardChangedUnderneath(input.card.id);

    this.logger.log(`Card ${input.card.id}: ${input.card.status} → ${input.to}`);
    return patched;
  }
}

/** Statuses a card can lapse from. Mirrors the store's own list. */
const EXPIRABLE_STATUSES: readonly CardStatus[] = [
  CardStatus.ACTIVE,
  CardStatus.INACTIVE,
  CardStatus.FROZEN,
  CardStatus.DELIVERED,
];

function assertTransitionAllowed(card: CardRecord, to: CardStatus): void {
  if (canTransition(card.status, to)) return;

  throw new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message: `A card that is ${describe(card.status)} cannot be ${describe(to)}.`,
    context: { cardId: card.id, from: card.status, to },
  });
}

function assertAwaitingActivation(card: CardRecord): void {
  if (ACTIVATABLE_STATUSES.includes(card.status)) return;

  throw cardStateConflict({
    cardId: card.id,
    status: card.status,
    message:
      card.status === CardStatus.ACTIVE
        ? 'This card is already active and ready to use.'
        : 'This card is not ready to be activated yet. We will let you know when it arrives.',
  });
}

/**
 * The digits printed on the card have to match the ones on file.
 *
 * The check is the only proof the bank gets that the person activating the card is
 * holding it. Without it a letter announcing a card in the post would be enough to
 * activate one that was intercepted before it arrived.
 */
function assertLast4Matches(card: CardRecord, last4: string): void {
  if (card.last4 === last4) return;

  throw new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message:
      'Those last four digits do not match the card we sent you. Check the card and try again.',
    context: { cardId: card.id },
  });
}

function describe(status: CardStatus): string {
  return status.toLowerCase();
}
