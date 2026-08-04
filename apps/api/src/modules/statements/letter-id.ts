/**
 * Letter identifiers, derived the same way statement ones are.
 *
 * A letter states facts the bank already holds as at a given date. Nothing new is created
 * when one is issued, so the identifier carries the three things that decide what the
 * letter says — the account, the kind, and the date it speaks as of — and a request for
 * the same three resolves to the same letter rather than to a second one.
 *
 * `addressedTo` is deliberately *not* in here. Who a letter is written to changes its
 * salutation, not its content, and folding free text into an identifier would give the
 * same statement of fact a different reference for every recipient.
 */

import { LetterKind } from '@reliance/contracts';

import {
  accountTag,
  decodeBase32,
  encodeBase32,
  identifierBody,
  maskOf,
  PAYLOAD_CHARACTERS,
  TAG_BITS,
  TIME_CHARACTERS,
} from './document-id.js';
import { dayNumber, isoDay } from './statement-period.js';
import { LETTER_ID_PREFIX } from './statements.constants.js';

/** What a letter identifier resolves back to. */
export interface DecodedLetterId {
  readonly kind: LetterKind;
  readonly asOf: Date;
}

/** Ordered so an identifier already issued keeps meaning the same letter. Append only. */
const KINDS: readonly LetterKind[] = [
  LetterKind.PROOF_OF_BALANCE,
  LetterKind.PROOF_OF_ADDRESS,
  LetterKind.BANK_REFERENCE,
  LetterKind.ACCOUNT_CONFIRMATION,
  LetterKind.INTEREST_CERTIFICATE,
];

const DAY_BITS = 20n;
const KIND_BITS = 4n;
const DAY_MASK = maskOf(DAY_BITS);
const KIND_MASK = maskOf(KIND_BITS);
const TAG_MASK = maskOf(TAG_BITS);
const DAY_SHIFT = KIND_BITS + TAG_BITS;
const MILLISECONDS_PER_DAY = 86_400_000;

export function letterId(input: { accountId: string; kind: LetterKind; asOf: Date }): string {
  const payload =
    (BigInt(dayNumber(input.asOf)) << DAY_SHIFT) |
    (BigInt(kindIndex(input.kind)) << TAG_BITS) |
    accountTag(input.accountId);

  const time = encodeBase32(BigInt(input.asOf.getTime()), TIME_CHARACTERS);
  return `${LETTER_ID_PREFIX}_${time}${encodeBase32(payload, PAYLOAD_CHARACTERS)}`;
}

/** Reads a letter identifier back, or null if it was not issued for this account. */
export function decodeLetterId(id: string, accountId: string): DecodedLetterId | null {
  const body = identifierBody(id, LETTER_ID_PREFIX);
  if (!body) return null;

  const payload = decodeBase32(body.slice(TIME_CHARACTERS));
  if (payload === null || (payload & TAG_MASK) !== accountTag(accountId)) return null;

  const kind = KINDS[Number((payload >> TAG_BITS) & KIND_MASK)];
  if (!kind) return null;

  return { kind, asOf: new Date(Number((payload >> DAY_SHIFT) & DAY_MASK) * MILLISECONDS_PER_DAY) };
}

/** `YYYY-MM-DD` of the date a letter speaks as of. */
export function asOfDay(at: Date): string {
  return isoDay(at);
}

function kindIndex(kind: LetterKind): number {
  const index = KINDS.indexOf(kind);
  return index === -1 ? 0 : index;
}

/** The kinds this bank issues, in the order the letters screen lists them. */
export const LETTER_KINDS = KINDS;
