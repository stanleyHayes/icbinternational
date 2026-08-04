import { CardFormat, type CardTier } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { DEFAULT_ALLOWED_COUNTRIES, DEFAULT_BLOCKED_MCCS } from '../card.constants.js';
import { type StoredCardControls } from '../card.store.js';

/**
 * The controls a card is born with.
 *
 * The defaults are deliberately tight, and each one is a judgement about what the customer
 * would have chosen if asked:
 *
 * - **International payments off.** A card that has never left the country being used
 *   abroad is the classic first symptom of a compromise, and switching it on takes one tap
 *   before a holiday.
 * - **Magstripe off.** A stripe carries no cryptogram and is cloneable from one swipe.
 * - **Gambling and quasi-cash blocked.** Both are irreversible, and neither should be
 *   reachable on a card the customer has not thought about since it arrived.
 *
 * Everything else — chip, contactless, online, ATM — is on, because a card that cannot buy
 * a coffee out of the envelope is not a card, it is homework.
 */
export function defaultControlsFor(input: {
  format: CardFormat;
  tier: CardTier;
  currency: CurrencyCode;
}): StoredCardControls {
  const ceilings = TIER_CEILINGS[input.tier];

  return {
    onlinePayments: true,
    // A virtual card has no chip to tap, so the switch would be inert. Off is the honest
    // value: a control that claims to govern something it cannot is worse than no control.
    contactless: input.format === CardFormat.PHYSICAL,
    atmWithdrawals: input.format === CardFormat.PHYSICAL,
    internationalPayments: false,
    magstripe: false,
    perTransactionLimit: toStored(Money.fromMinor(ceilings.perTransaction, input.currency)),
    dailySpendLimit: toStored(Money.fromMinor(ceilings.daily, input.currency)),
    monthlySpendLimit: toStored(Money.fromMinor(ceilings.monthly, input.currency)),
    dailyAtmLimit: toStored(Money.fromMinor(ceilings.dailyAtm, input.currency)),
    blockedMccs: [...DEFAULT_BLOCKED_MCCS],
    allowedCountries: [...DEFAULT_ALLOWED_COUNTRIES],
  };
}

/** Opening ceilings by tier, in minor units. The customer can move any of them. */
interface TierCeilings {
  readonly perTransaction: bigint;
  readonly daily: bigint;
  readonly monthly: bigint;
  readonly dailyAtm: bigint;
}

/**
 * What each tier is worth on day one.
 *
 * These are starting positions, not entitlements: the customer raises or lowers any of
 * them from the app, and the product's own limit matrix still applies on top. A tier that
 * silently granted an unbounded limit would make the premium fee the only thing standing
 * between a compromised card and an empty account.
 */
const TIER_CEILINGS: Readonly<Record<CardTier, TierCeilings>> = Object.freeze({
  STANDARD: Object.freeze({
    perTransaction: 100_000n,
    daily: 200_000n,
    monthly: 500_000n,
    dailyAtm: 50_000n,
  }),
  PREMIUM: Object.freeze({
    perTransaction: 300_000n,
    daily: 750_000n,
    monthly: 2_000_000n,
    dailyAtm: 100_000n,
  }),
  METAL: Object.freeze({
    perTransaction: 1_000_000n,
    daily: 2_500_000n,
    monthly: 10_000_000n,
    dailyAtm: 200_000n,
  }),
});
