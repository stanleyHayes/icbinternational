import { type Hold } from '@reliance/contracts';

import { toIso } from '../accounts/index.js';

import { type HoldRecord } from './hold.store.js';

/**
 * Persistence record to the frozen wire contract.
 *
 * `capturedAmount` and `capturedEntryId` are stored but not on the wire: the contract's
 * `holdSchema` has no field for either, and the customer sees the captured amount as the
 * transaction it produced rather than as a property of the hold. They are kept in the
 * document because a partial capture is exactly the case a customer queries, and "we know
 * but did not write it down" is not an answer a bank can give.
 */
export function toContractHold(record: HoldRecord): Hold {
  return {
    id: record.id,
    accountId: record.accountId,
    amount: { ...record.amount, currency: record.amount.currency as Hold['amount']['currency'] },
    reason: record.reason,
    status: record.status,
    description: record.description,
    placedAt: toIso(record.placedAt),
    expiresAt: record.expiresAt ? toIso(record.expiresAt) : null,
    resolvedAt: record.resolvedAt ? toIso(record.resolvedAt) : null,
  };
}
