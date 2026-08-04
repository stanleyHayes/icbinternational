import { type TransferDestination } from '@reliance/contracts';

/**
 * Canonical, comparable keys for a payment destination.
 *
 * Two payees are "the same payee" when they name the same account, but the contract lets
 * a customer name an internal account four different ways — by id, by account number, by
 * email or by handle. Comparing the raw destination objects would therefore report a
 * saved payee and the transfer that pays them as unrelated, and the cooling-off rule that
 * depends on recognising a payee would never fire.
 *
 * A key is a lower-cased, prefixed string so that keys from different rails can share one
 * index without an email ever colliding with an IBAN.
 */

const SEPARATOR = ':';

/** Namespace per rail, so `domestic:0409…` and `international:GB…` cannot collide. */
const KEY_NAMESPACE = {
  internalAccount: 'internal:acc',
  internalNumber: 'internal:num',
  internalEmail: 'internal:email',
  internalHandle: 'internal:handle',
  domestic: 'domestic',
  international: 'international',
} as const;

/**
 * Every key a destination can be recognised by.
 *
 * A list rather than a single value because an internal destination given as an email is
 * *also* the account it resolves to, and a caller that knows the resolution can widen the
 * match without the saved record having to be rewritten.
 */
export function destinationKeys(destination: TransferDestination): string[] {
  if (destination.kind === 'DOMESTIC') {
    return [key(KEY_NAMESPACE.domestic, destination.sortCode, destination.accountNumber)];
  }

  if (destination.kind === 'INTERNATIONAL') {
    return [key(KEY_NAMESPACE.international, destination.iban)];
  }

  return internalKeys(destination);
}

/** The internal identifiers present on the destination, in order of specificity. */
function internalKeys(destination: Extract<TransferDestination, { kind: 'INTERNAL' }>): string[] {
  const candidates: Array<string | undefined> = [
    destination.accountId && key(KEY_NAMESPACE.internalAccount, destination.accountId),
    destination.accountNumber && key(KEY_NAMESPACE.internalNumber, destination.accountNumber),
    destination.email && key(KEY_NAMESPACE.internalEmail, destination.email),
    destination.handle && key(KEY_NAMESPACE.internalHandle, destination.handle),
  ];

  return candidates.filter((candidate): candidate is string => candidate !== undefined);
}

/**
 * Keys for an internal destination that has been resolved to a real account.
 *
 * Resolution is what closes the gap between "saved by email" and "paid by account
 * number": both resolve to the same account, so both produce the same account key.
 */
export function resolvedInternalKeys(input: {
  accountId: string;
  accountNumber: string;
}): string[] {
  return [
    key(KEY_NAMESPACE.internalAccount, input.accountId),
    key(KEY_NAMESPACE.internalNumber, input.accountNumber),
  ];
}

/**
 * The single key a destination is stored under.
 *
 * The most specific identifier wins, because that is the one least likely to be reassigned
 * to somebody else later.
 */
export function primaryDestinationKey(destination: TransferDestination): string {
  const [first] = destinationKeys(destination);
  if (first) return first;

  // `internalDestinationSchema` documents "exactly one of these" but does not enforce it
  // (see `docs/CONTRACT_CHANGES.md`), so callers run `assertOneInternalIdentifier` first
  // and this is the backstop. It throws rather than returning an empty key because an
  // unkeyed payee would match every other unkeyed payee — silently, and across customers.
  throw new RangeError('A transfer destination carries no identifier to key it by');
}

function key(namespace: string, ...parts: string[]): string {
  return [namespace, ...parts].join(SEPARATOR).toLowerCase();
}
