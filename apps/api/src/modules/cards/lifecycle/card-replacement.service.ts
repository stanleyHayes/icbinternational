import { Injectable, Logger } from '@nestjs/common';

import { CardFormat, CardStatus, type ReportCardRequest } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { cardStateConflict } from '../card.errors.js';
import { CardStore, type CardRecord } from '../card.store.js';
import { CardIssuingService } from '../issuing/card-issuing.service.js';

import { CardLifecycleService } from './card-lifecycle.service.js';
import { REPORTABLE_STATUSES } from './card-status.rules.js';

/** What the customer reported, and what that does to the card. */
type ReportReason = ReportCardRequest['reason'];

/**
 * Which status a report puts the card into.
 *
 * `DAMAGED` and `NOT_RECEIVED` cancel rather than mark the card stolen. A snapped card is
 * not a security incident and a card that never arrived may be sitting in a sorting
 * office; conflating either with theft would put a fraud marker on a customer's file for
 * a postal problem.
 */
const REPORT_OUTCOMES: Readonly<Record<ReportReason, CardStatus>> = Object.freeze({
  LOST: CardStatus.LOST,
  STOLEN: CardStatus.STOLEN,
  FRAUD: CardStatus.STOLEN,
  DAMAGED: CardStatus.CANCELLED,
  NOT_RECEIVED: CardStatus.CANCELLED,
});

/** The card that was taken out of use, and the one that takes over. */
export interface ReplacementResult {
  readonly reported: CardRecord;
  /** Null when the customer declined a replacement. */
  readonly replacement: CardRecord | null;
}

/**
 * Reporting a card, and putting a new one in its place.
 *
 * The order of operations is the point. The old card is **blocked first** and the
 * replacement issued second, so that a failure anywhere in issuing still leaves the
 * compromised card dead. Doing it the other way round would create a window — small, but
 * exactly the window a thief is standing in a shop inside of — where the reported card
 * still authorises.
 *
 * A replacement inherits the original's format, tier and nickname, and points back at it
 * through `replacesCardId`. It does **not** inherit the PIN or the controls: a card
 * replaced because it was cloned should not carry the settings that were cloned with it,
 * and a PIN somebody may have watched being entered is not a PIN worth keeping.
 */
@Injectable()
export class CardReplacementService {
  private readonly logger = new Logger(CardReplacementService.name);

  constructor(
    private readonly cards: CardStore,
    private readonly lifecycle: CardLifecycleService,
    private readonly issuing: CardIssuingService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Blocks a reported card and, unless told not to, issues its replacement.
   *
   * @throws {AppError} `CONFLICT` for a card that is already out of circulation.
   */
  async report(input: {
    userId: string;
    card: CardRecord;
    request: ReportCardRequest;
  }): Promise<ReplacementResult> {
    assertReportable(input.card);

    const reported = await this.lifecycle.move({
      card: input.card,
      to: REPORT_OUTCOMES[input.request.reason],
      fields: { reportedReason: input.request.reason, cancelledAt: this.clock.now() },
      from: REPORTABLE_STATUSES,
    });

    this.logger.warn(`Card ${reported.id} reported ${input.request.reason.toLowerCase()}`);

    if (!input.request.orderReplacement) return { reported, replacement: null };

    return { reported, replacement: await this.reissue(input.userId, reported) };
  }

  /**
   * Replaces a card the customer still holds — a worn stripe, a change of name.
   *
   * The original is cancelled rather than left live. Two cards drawing on one account with
   * the customer believing only one is active is how a forgotten card ends up funding a
   * subscription nobody can find.
   */
  async replace(input: { userId: string; card: CardRecord }): Promise<ReplacementResult> {
    const cancelled = await this.lifecycle.cancel(input.card, 'REPLACED');
    return { reported: cancelled, replacement: await this.reissue(input.userId, cancelled) };
  }

  /**
   * Issues the successor and links the two cards together.
   *
   * The link is written on the old card as well as the new one so that both directions
   * are answerable: "what replaced this?" from a statement line, and "what did this
   * replace?" from the card in the customer's hand.
   */
  private async reissue(userId: string, original: CardRecord): Promise<CardRecord> {
    const replacement = await this.issuing.issue({
      userId,
      replacesCardId: original.id,
      request: {
        accountId: original.accountId,
        format: original.format,
        tier: original.tier,
        deliveryAddressOverride: false,
        ...(original.nickname ? { nickname: original.nickname } : {}),
      },
    });

    await this.cards.patch({
      cardId: original.id,
      fields: { replacedByCardId: replacement.id },
    });

    this.logger.log(
      `Card ${original.id} replaced by ${replacement.id} (${describeFormat(original.format)})`,
    );
    return replacement;
  }
}

function assertReportable(card: CardRecord): void {
  if (REPORTABLE_STATUSES.includes(card.status)) return;

  throw cardStateConflict({
    cardId: card.id,
    status: card.status,
    message: 'This card is already out of use, so there is nothing left to report on it.',
  });
}

function describeFormat(format: CardFormat): string {
  return format === CardFormat.VIRTUAL ? 'virtual, available now' : 'physical, on its way';
}
