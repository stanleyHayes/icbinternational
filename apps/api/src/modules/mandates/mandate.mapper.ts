import { type Mandate } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { toIso } from '../accounts/index.js';

import { type MandateRecord } from './mandate.store.js';

/**
 * A stored mandate, on the wire.
 *
 * The collection history is not projected. The contract models a mandate as an authority
 * with a last-collected date, and the individual collections are already on the customer's
 * statement as transactions — publishing them twice would give the client two lists that can
 * disagree about the same money. What the wire carries is the summary: when the merchant
 * last took something, how much, and when they are expected next.
 */
export function toContractMandate(record: MandateRecord): Mandate {
  return {
    id: record.id,
    status: record.status,
    merchantName: record.merchantName,
    merchantLogoUrl: record.merchantLogoUrl,
    accountId: record.accountId,
    reference: record.reference,
    fixedAmount: toWireMoney(record.fixedAmount),
    maxAmount: toWireMoney(record.maxAmount),
    frequency: record.frequency,
    lastCollectedAt: record.lastCollectedAt ? toIso(record.lastCollectedAt) : null,
    lastAmount: toWireMoney(record.lastAmount),
    nextExpectedAt: record.nextExpectedAt ? toIso(record.nextExpectedAt) : null,
    createdAt: toIso(record.createdAt),
    cancelledAt: record.cancelledAt ? toIso(record.cancelledAt) : null,
  };
}

/**
 * Stored money to wire money, preserving null.
 *
 * The two shapes are identical by design — see `money.codec.ts` — so this widens the
 * currency's type rather than converting anything.
 */
function toWireMoney(stored: StoredMoney | null): Mandate['fixedAmount'] {
  if (!stored) return null;

  return {
    amount: stored.amount,
    currency: stored.currency as NonNullable<Mandate['fixedAmount']>['currency'],
  };
}
