import { Injectable, Logger } from '@nestjs/common';

import { CardFormat, CardStatus } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { DELIVERY_STAGE_DAYS } from '../card.constants.js';
import { CardStore, type CardRecord } from '../card.store.js';
import { CardLifecycleService } from '../lifecycle/card-lifecycle.service.js';

/** Milliseconds in a day, for measuring how long a card has sat in a stage. */
const MILLISECONDS_PER_DAY = 86_400_000;

/** One step of the production and delivery run. */
interface DeliveryStage {
  readonly from: CardStatus;
  readonly to: CardStatus;
  /** Days after the order before this stage is reached. */
  readonly afterDays: number;
  /** Which timestamp the stage records. */
  readonly stamp: 'printedAt' | 'shippedAt' | 'deliveredAt';
}

/**
 * The stages a physical card moves through, in order.
 *
 * Real cards are printed in batches overnight, dispatched the following day and arrive
 * within the working week. Modelling the wait rather than skipping it is what makes the
 * rest of the product honest: the app has to have something truthful to show on day two,
 * activation has to be impossible until day five, and "my card has not arrived" has to be
 * a state the bank can recognise and act on.
 */
const STAGES: readonly DeliveryStage[] = Object.freeze([
  Object.freeze({
    from: CardStatus.ORDERED,
    to: CardStatus.PRINTING,
    afterDays: DELIVERY_STAGE_DAYS.PRINTING,
    stamp: 'printedAt' as const,
  }),
  Object.freeze({
    from: CardStatus.PRINTING,
    to: CardStatus.SHIPPED,
    afterDays: DELIVERY_STAGE_DAYS.SHIPPED,
    stamp: 'shippedAt' as const,
  }),
  Object.freeze({
    from: CardStatus.SHIPPED,
    to: CardStatus.DELIVERED,
    afterDays: DELIVERY_STAGE_DAYS.DELIVERED,
    stamp: 'deliveredAt' as const,
  }),
]);

/**
 * Moving a physical card from order to letterbox.
 *
 * Driven by the simulated clock rather than by a timer, which is what lets an operator
 * advance the business date by a week and watch every outstanding card arrive — and lets
 * a test do the same in a millisecond.
 *
 * A delivered card lands on `DELIVERED`, not `ACTIVE`. It has reached the customer and
 * has still not been proven to be *in their hands*, and that gap is where card
 * interception lives. Activation closes it.
 */
@Injectable()
export class CardDeliveryService {
  private readonly logger = new Logger(CardDeliveryService.name);

  constructor(
    private readonly cards: CardStore,
    private readonly lifecycle: CardLifecycleService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Advances one card as far as the elapsed time allows.
   *
   * A card whose order is a week old on a clock that jumped forward passes through print
   * and dispatch in the same call rather than needing three sweeps, because the customer
   * asking where their card is deserves the true answer, not the next one in the queue.
   *
   * @returns The card at whatever stage it has genuinely reached.
   */
  async advance(card: CardRecord): Promise<CardRecord> {
    if (card.format !== CardFormat.PHYSICAL) return card;

    let current = card;
    const elapsedDays = this.daysSince(card.orderedAt);

    for (const stage of STAGES) {
      // Skip the stages this card is already past rather than stopping at them. A card
      // that reached `PRINTING` on an earlier sweep would otherwise never move again,
      // because the first stage in the list no longer matches its status.
      if (current.status !== stage.from) continue;

      // Stop at the first stage whose day has not come. The list is in order, so nothing
      // after it can be due either.
      if (elapsedDays < stage.afterDays) break;

      current = await this.applyStage(current, stage);
    }

    return current;
  }

  /**
   * Advances every physical card that is due to move.
   *
   * @param limit How many cards one pass considers.
   * @returns How many cards moved at least one stage.
   */
  async advanceDue(accountId: string): Promise<number> {
    const cards = await this.cards.listByAccount(accountId);
    let moved = 0;

    for (const card of cards) {
      const advanced = await this.advance(card);
      if (advanced.status !== card.status) moved += 1;
    }

    return moved;
  }

  private async applyStage(card: CardRecord, stage: DeliveryStage): Promise<CardRecord> {
    const moved = await this.lifecycle.move({
      card,
      to: stage.to,
      fields: { [stage.stamp]: this.clock.now() },
      from: [stage.from],
    });

    this.logger.log(`Card ${card.id} ${stage.to.toLowerCase()}`);
    return moved;
  }

  private daysSince(at: Date): number {
    return Math.floor((this.clock.timestamp() - at.getTime()) / MILLISECONDS_PER_DAY);
  }
}
