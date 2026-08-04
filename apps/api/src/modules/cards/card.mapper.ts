import { type Card, type CardAuthorisation, type CardControls } from '@reliance/contracts';
import { Money, type CurrencyCode, type MoneyJSON } from '@reliance/money';

import { fromStored, type StoredMoney } from '../../common/money/money.codec.js';

import { type AuthorisationRecord } from './authorisation/authorisation.store.js';
import { type CardRecord, type StoredCardControls } from './card.store.js';

/**
 * Persistence records to the frozen wire contract.
 *
 * One direction only, and one omission that is the point of the whole module: the card
 * record carries a `panToken` and a `pinHash`, and neither appears in the contract shape.
 * The mapper is where that guarantee is enforced, because it enumerates the fields it
 * emits rather than spreading the record — a sensitive column added upstream cannot leak
 * through a mapper that never mentions it.
 */
export function toContractCard(record: CardRecord): Card {
  return {
    id: record.id,
    accountId: record.accountId,
    format: record.format,
    scheme: record.scheme,
    tier: record.tier,
    status: record.status,
    nickname: record.nickname,
    cardholderName: record.cardholderName,
    last4: record.last4,
    expiryMonth: record.expiryMonth,
    expiryYear: record.expiryYear,
    currency: assertCurrency(record.currency),
    controls: toContractControls(record.controls),
    lockedMerchantId: record.lockedMerchantId,
    isDefault: record.isDefault,
    pinSet: record.pinHash !== null,
    replacesCardId: record.replacesCardId,
    orderedAt: toIso(record.orderedAt),
    activatedAt: record.activatedAt ? toIso(record.activatedAt) : null,
    expiresAt: toIso(record.expiresAt),
  };
}

/** Stored controls to the wire shape. */
export function toContractControls(controls: StoredCardControls): CardControls {
  return {
    onlinePayments: controls.onlinePayments,
    contactless: controls.contactless,
    atmWithdrawals: controls.atmWithdrawals,
    internationalPayments: controls.internationalPayments,
    magstripe: controls.magstripe,
    perTransactionLimit: toWireMoney(controls.perTransactionLimit),
    dailySpendLimit: toWireMoney(controls.dailySpendLimit),
    monthlySpendLimit: toWireMoney(controls.monthlySpendLimit),
    dailyAtmLimit: toWireMoney(controls.dailyAtmLimit),
    blockedMccs: [...controls.blockedMccs],
    allowedCountries: [...controls.allowedCountries],
  };
}

/**
 * An authorisation on the wire.
 *
 * The internal record carries more than the contract does — the amount requested before a
 * partial approval, the clearing and settlement references, the increment count. Those
 * are the bank's reconciliation apparatus, not the customer's business, and the mapper
 * drops them by not naming them.
 */
export function toContractAuthorisation(record: AuthorisationRecord): CardAuthorisation {
  return {
    id: record.id,
    cardId: record.cardId,
    accountId: record.accountId,
    status: record.status,
    amount: fromStored(record.amount).toJSON(),
    originalAmount: toWireMoney(record.originalAmount),
    merchantName: record.merchantName,
    merchantCountry: record.merchantCountry,
    mcc: record.mcc,
    channel: record.channel,
    declineReason: record.declineReason,
    holdId: record.holdId,
    transactionId: record.transactionId,
    threeDsChallenged: record.threeDsChallenged,
    authorisedAt: toIso(record.authorisedAt),
    capturedAt: record.capturedAt ? toIso(record.capturedAt) : null,
    expiresAt: toIso(record.expiresAt),
  };
}

/**
 * ISO-8601 with a `Z`, matching `isoDateTimeSchema`, which rejects a numeric offset.
 *
 * `Date.prototype.toISOString` already emits exactly that form; the helper exists so the
 * assumption is stated once instead of at every timestamp on the wire.
 */
export function toIso(value: Date): string {
  return value.toISOString();
}

/**
 * Storage money to wire money.
 *
 * The two shapes are identical by design, but storage types the currency as a bare string
 * while the contract types it as a `CurrencyCode`. Round-tripping through `Money` turns
 * that assumption into a check: a currency missing from the table throws here rather than
 * reaching a client that cannot render it.
 */
function toWireMoney(stored: StoredMoney | null): MoneyJSON | null {
  return stored ? fromStored(stored).toJSON() : null;
}

/** The card's currency, checked against the supported table rather than merely cast. */
function assertCurrency(currency: string): CurrencyCode {
  return Money.zero(currency as CurrencyCode).currency;
}
