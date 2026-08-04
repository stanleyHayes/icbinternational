import { Injectable } from '@nestjs/common';

import { CardFormat, CardStatus, type CardScheme, type CardTier } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { CARD_VALIDITY_YEARS } from '../../../rails/card-network/index.js';
import { UsersService } from '../../auth/users/index.js';
import { type NewCard } from '../card.store.js';
import { defaultControlsFor } from '../controls/default-controls.js';

import { PanTokeniser, type MintedCard } from './pan-tokeniser.js';

/** Months in a year, for stepping a card's expiry to the end of its final month. */
const MONTHS_PER_YEAR = 12;

/** The last instant of a UTC day, spelled out so the expiry arithmetic reads plainly. */
const END_OF_DAY = { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 } as const;

/** What the caller must decide before a card can be minted. */
export interface CardDraft {
  readonly accountId: string;
  readonly userId: string;
  readonly currency: CurrencyCode;
  readonly format: CardFormat;
  readonly scheme: CardScheme;
  readonly tier: CardTier;
  readonly nickname: string | null;
  /** Set when this card takes over from one that was lost, stolen or expiring. */
  readonly replacesCardId: string | null;
}

/**
 * Assembling a card from a draft.
 *
 * The factory is where the two facts about a new card that must never be got wrong are
 * decided in one place: that it starts life in the right state for its format, and that
 * its number exists only as a token.
 *
 * A **virtual** card is live the instant it is minted — there is nothing to post and
 * nothing to activate, and making a customer "activate" a number that appeared on their
 * screen a second ago would be ceremony with no security behind it. A **physical** card
 * starts `ORDERED` and cannot be spent on until somebody has held it and activated it,
 * which is what stops a card intercepted in the post from working.
 */
@Injectable()
export class CardFactory {
  constructor(
    private readonly tokeniser: PanTokeniser,
    private readonly users: UsersService,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
  ) {}

  /** Builds the record for a new card. Writes nothing. */
  async build(draft: CardDraft): Promise<NewCard> {
    const now = this.clock.now();

    return {
      id: this.ids.generate('card'),
      cardholderName: await this.cardholderName(draft.userId),
      ...identityOf(draft, this.tokeniser.mint(draft.scheme)),
      ...lifecycleOf(draft, now, expiryFrom(now)),
    };
  }

  /**
   * The name embossed on the card.
   *
   * Taken from the customer's verified profile rather than from the request. A card
   * carrying a name the customer typed themselves is a card whose name proves nothing,
   * and the name on a card is one of the few things a merchant can check.
   */
  private async cardholderName(userId: string): Promise<string> {
    const user = await this.users.requireById(userId);
    return `${user.firstName} ${user.lastName}`.trim().toUpperCase();
  }
}

/** What the card *is*: where it lives, what scheme it rides, and its tokenised number. */
function identityOf(draft: CardDraft, minted: MintedCard) {
  return {
    accountId: draft.accountId,
    userId: draft.userId,
    format: draft.format,
    scheme: draft.scheme,
    tier: draft.tier,
    nickname: draft.nickname,
    currency: draft.currency,
    panToken: minted.panToken,
    last4: minted.last4,
    bin: minted.bin,
    controls: defaultControlsFor({
      format: draft.format,
      tier: draft.tier,
      currency: draft.currency,
    }),
  };
}

/** Where the card starts life, and every timestamp that is not yet true of it. */
function lifecycleOf(draft: CardDraft, now: Date, expiry: CardExpiry) {
  const isVirtual = draft.format === CardFormat.VIRTUAL;

  return {
    status: isVirtual ? CardStatus.ACTIVE : CardStatus.ORDERED,
    expiryMonth: expiry.month,
    expiryYear: expiry.year,
    lockedMerchantId: null,
    isDefault: false,
    pinHash: null,
    pinAttempts: 0,
    pinLockedUntil: null,
    replacesCardId: draft.replacesCardId,
    replacedByCardId: null,
    reportedReason: null,
    orderedAt: now,
    printedAt: null,
    shippedAt: null,
    deliveredAt: null,
    activatedAt: isVirtual ? now : null,
    cancelledAt: null,
    expiresAt: expiry.at,
  };
}

/** The printed month and year, and the instant the card actually stops working. */
export interface CardExpiry {
  readonly month: number;
  readonly year: number;
  readonly at: Date;
}

/**
 * A card's expiry: the last day of the same month, three years on.
 *
 * Cards expire at the *end* of the printed month, not on its first instant. A card
 * embossed `03/29` is valid through 31 March 2029, and an issuer that killed it on the
 * 1st would strand every customer who read the date the way it is printed.
 */
export function expiryFrom(issuedAt: Date): CardExpiry {
  const month = issuedAt.getUTCMonth();
  const year = issuedAt.getUTCFullYear() + CARD_VALIDITY_YEARS;

  return {
    month: month + 1,
    year,
    // Day zero of the following month is the last day of this one.
    at: new Date(
      Date.UTC(
        year,
        month + 1,
        0,
        END_OF_DAY.hours,
        END_OF_DAY.minutes,
        END_OF_DAY.seconds,
        END_OF_DAY.milliseconds,
      ),
    ),
  };
}

/** The scheme a card of this tier is issued on. */
export function schemeForTier(tier: CardTier): CardScheme {
  return TIER_SCHEMES[tier];
}

/**
 * Which network each tier rides.
 *
 * Standard debit goes out on Visa and the paid tiers on Mastercard, matching the
 * commercial agreements behind each product. It is a business fact rather than a
 * technical one, which is why it is a table and not a condition buried in the factory.
 */
const TIER_SCHEMES: Readonly<Record<CardTier, CardScheme>> = Object.freeze({
  STANDARD: 'VISA',
  PREMIUM: 'MASTERCARD',
  METAL: 'MASTERCARD',
});

/** Guards against a month index escaping its range when expiry arithmetic changes. */
export function isValidExpiryMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= MONTHS_PER_YEAR;
}
