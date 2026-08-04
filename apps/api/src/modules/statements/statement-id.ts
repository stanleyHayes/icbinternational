/**
 * Statement identifiers, derived rather than minted.
 *
 * A statement is a summary of the ledger over a period, not a record of its own — so
 * there is no row to hold an identifier and no write to allocate one. The identifier is
 * instead a pure function of what the statement covers: the account, the two day
 * boundaries and the format. The same period always resolves to the same `stm_`, and the
 * period can be read back out of it, which is what lets
 * `GET /accounts/:id/statements/:statementId` answer without anything having been stored.
 *
 * Layout, after the `stm_` prefix: ten characters of closing instant, then eighty bits of
 * start day, end day, format and account digest.
 */

import { ID_PREFIX, StatementFormat } from '@reliance/contracts';

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
import { dayNumber, periodFromDays, type StatementPeriod } from './statement-period.js';

/** What a statement identifier resolves back to. */
export interface DecodedStatementId {
  readonly period: StatementPeriod;
  readonly format: StatementFormat;
}

/** Ordered so an identifier already issued keeps meaning the same format. Append only. */
const FORMATS: readonly StatementFormat[] = [
  StatementFormat.PDF,
  StatementFormat.CSV,
  StatementFormat.OFX,
];

const DAY_BITS = 20n;
const FORMAT_BITS = 4n;
const DAY_MASK = maskOf(DAY_BITS);
const FORMAT_MASK = maskOf(FORMAT_BITS);
const TAG_MASK = maskOf(TAG_BITS);
const START_SHIFT = DAY_BITS + FORMAT_BITS + TAG_BITS;
const END_SHIFT = FORMAT_BITS + TAG_BITS;

/** The identifier for one account's statement over one period in one format. */
export function statementId(input: {
  accountId: string;
  period: StatementPeriod;
  format: StatementFormat;
}): string {
  const payload =
    (BigInt(dayNumber(input.period.start)) << START_SHIFT) |
    (BigInt(dayNumber(input.period.end)) << END_SHIFT) |
    (BigInt(formatIndex(input.format)) << TAG_BITS) |
    accountTag(input.accountId);

  const time = encodeBase32(BigInt(input.period.end.getTime()), TIME_CHARACTERS);
  return `${ID_PREFIX.statement}_${time}${encodeBase32(payload, PAYLOAD_CHARACTERS)}`;
}

/**
 * Reads a statement identifier back, or null if it was not issued for this account.
 *
 * Null covers every failure — wrong prefix, stray character, another customer's account —
 * because the caller's only sensible response to all of them is the same 404.
 */
export function decodeStatementId(id: string, accountId: string): DecodedStatementId | null {
  const body = identifierBody(id, ID_PREFIX.statement);
  if (!body) return null;

  const payload = decodeBase32(body.slice(TIME_CHARACTERS));
  if (payload === null || (payload & TAG_MASK) !== accountTag(accountId)) return null;

  const format = FORMATS[Number((payload >> TAG_BITS) & FORMAT_MASK)];
  const startDay = Number((payload >> START_SHIFT) & DAY_MASK);
  const endDay = Number((payload >> END_SHIFT) & DAY_MASK);
  if (!format || endDay < startDay) return null;

  return { period: periodFromDays(startDay, endDay), format };
}

function formatIndex(format: StatementFormat): number {
  const index = FORMATS.indexOf(format);
  return index === -1 ? 0 : index;
}
