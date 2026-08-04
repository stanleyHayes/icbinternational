import { type Account, type Balance } from '@reliance/contracts';

import { toWire } from '../../common/money/money.codec.js';

import { type AccountRecord } from './account.store.js';
import { computeAvailability } from './availability.js';

/**
 * Persistence record to the frozen wire contract.
 *
 * One direction only. Nothing maps a contract `Account` back into a record, because
 * every field a client could send is either derived (the balances), assigned by the bank
 * (the identifiers) or pinned at opening (the product) — an inbound account object would
 * be a request to overwrite the bank's own books.
 */
export function toContractAccount(record: AccountRecord, asOf: Date): Account {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type,
    status: record.status,
    currency: record.currency as Account['currency'],
    productCode: record.productCode,
    productName: record.productName,
    nickname: record.nickname,
    number: record.number,
    sortCode: record.sortCode,
    iban: record.iban,
    balance: toContractBalance(record, asOf),
    holderIds: [...record.holderIds],
    interestRateBps: record.interestRateBps,
    isPrimary: record.isPrimary,
    openedAt: toIso(record.openedAt),
    closedAt: record.closedAt ? toIso(record.closedAt) : null,
  };
}

/**
 * The balance block, computed rather than read.
 *
 * `available` and `overdraftAvailable` are derived by {@link computeAvailability} at read
 * time instead of being stored, so that re-sizing an overdraft facility takes effect
 * immediately everywhere rather than waiting for something to rewrite each account.
 */
export function toContractBalance(record: AccountRecord, asOf: Date): Balance {
  const snapshot = computeAvailability(record);

  return {
    ledger: toWire(snapshot.ledger),
    available: toWire(snapshot.available),
    held: toWire(snapshot.held),
    overdraftAvailable: toWire(snapshot.overdraftAvailable),
    asOf: toIso(asOf),
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
