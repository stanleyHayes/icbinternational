import { randomBytes } from 'node:crypto';

import { type PaymentRequest } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { toIso } from '../accounts/index.js';

import { QR_SCHEME, SHARE_URL_BASE, TOKEN_BYTES } from './payment-request.constants.js';
import { type PaymentRequestRecord } from './payment-request.store.js';

/**
 * Turning a stored request into a link, a QR payload and a wire object.
 *
 * The link and the QR code are two renderings of one token, never two tokens. A request
 * scanned from a phone screen and the same request opened from a message must be provably
 * the same request — otherwise "I already paid that" becomes an argument nobody can settle.
 */

/**
 * A fresh share token.
 *
 * From `randomBytes`, not from the id and not from a counter. The token is the whole of the
 * link's security: anybody holding it can pay the request, so a token that could be derived
 * from something visible would let a stranger enumerate every request the bank has open.
 */
export function mintToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** The link the customer shares. */
export function shareUrlFor(token: string): string {
  return `${SHARE_URL_BASE}${token}`;
}

/** What the QR code encodes: the same token, in the scheme the app registers. */
export function qrPayloadFor(token: string): string {
  return `${QR_SCHEME}${token}`;
}

/**
 * A stored request, on the wire.
 *
 * `userId`, `token` and `journalEntryId` are not projected. The token appears only inside
 * the link and the QR payload, so a client rendering the object cannot accidentally log the
 * credential on its own.
 */
export function toContractPaymentRequest(record: PaymentRequestRecord): PaymentRequest {
  return {
    id: record.id,
    status: record.status,
    requesterName: record.requesterName,
    amount: toWireMoney(record.amount),
    note: record.note,
    shareUrl: shareUrlFor(record.token),
    qrPayload: qrPayloadFor(record.token),
    destinationAccountId: record.destinationAccountId,
    paidByName: record.paidByName ?? record.payeeName,
    expiresAt: toIso(record.expiresAt),
    createdAt: toIso(record.createdAt),
    paidAt: record.paidAt ? toIso(record.paidAt) : null,
  };
}

/**
 * Stored money to wire money.
 *
 * The two shapes are identical by design — see `money.codec.ts` — so this widens the
 * currency's type rather than converting anything.
 */
function toWireMoney(stored: StoredMoney): PaymentRequest['amount'] {
  return {
    amount: stored.amount,
    currency: stored.currency as PaymentRequest['amount']['currency'],
  };
}
