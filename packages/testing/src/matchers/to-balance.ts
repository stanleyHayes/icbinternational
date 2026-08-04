/**
 * `toBalance()` — asserts that a set of postings satisfies the ledger invariant:
 * total debits equal total credits, per currency.
 *
 * Works on anything structurally posting-like (`{ direction, amount }`), so both the
 * domain `Posting` class and the contract `postingSchema` DTO are accepted, as is any
 * object exposing a `postings` array (a domain `JournalEntry`, a contract journal
 * entry DTO, a lean Mongoose document).
 */

import { PostingDirection } from '@reliance/contracts';

import { describeMoney, isMoneyLike, normaliseMoney, type NormalisedMoney } from './money-like.js';

/** Minimal structural shape of one side of a journal entry. */
export interface PostingLike {
  readonly direction: string;
  readonly amount: unknown;
}

interface NormalisedPosting {
  readonly direction: string;
  readonly money: NormalisedMoney;
}

/** Jest matcher implementation. Registered by `@reliance/testing/jest.setup`. */
export function toBalance(this: jest.MatcherContext, received: unknown): jest.CustomMatcherResult {
  const postings = normalisePostings(received);
  if (!postings) {
    return {
      pass: false,
      message: () =>
        `expected ${this.utils.printReceived(received)} to be a non-empty set of valid postings`,
    };
  }

  const offenders = currenciesOutOfBalance(postings);

  return {
    pass: offenders.length === 0,
    message: () =>
      offenders.length === 0
        ? 'expected postings not to balance, but debits equal credits in every currency'
        : `postings out of balance — ${offenders.join('; ')}`,
  };
}

/** Extracts and normalises the posting list, rejecting anything malformed. */
export function normalisePostings(received: unknown): readonly NormalisedPosting[] | null {
  const list = Array.isArray(received) ? received : postingsOf(received);
  if (!list || list.length === 0) return null;

  const normalised: NormalisedPosting[] = [];
  for (const item of list) {
    const posting = toNormalisedPosting(item);
    if (!posting) return null;
    normalised.push(posting);
  }
  return normalised;
}

function postingsOf(received: unknown): unknown[] | null {
  if (typeof received !== 'object' || received === null) return null;
  const candidate = (received as { postings?: unknown }).postings;
  return Array.isArray(candidate) ? candidate : null;
}

function toNormalisedPosting(value: unknown): NormalisedPosting | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.direction !== 'string' || !isMoneyLike(candidate.amount)) return null;

  const money = normaliseMoney(candidate.amount);
  return money ? { direction: candidate.direction, money } : null;
}

function currenciesOutOfBalance(postings: readonly NormalisedPosting[]): string[] {
  const debits = new Map<string, bigint>();
  const credits = new Map<string, bigint>();

  for (const { direction, money } of postings) {
    const target = direction === PostingDirection.DEBIT ? debits : credits;
    target.set(money.currency, (target.get(money.currency) ?? 0n) + money.amount);
  }

  const offenders: string[] = [];
  for (const currency of new Set([...debits.keys(), ...credits.keys()])) {
    const debit = debits.get(currency) ?? 0n;
    const credit = credits.get(currency) ?? 0n;
    if (debit === credit) continue;
    offenders.push(
      `${currency}: debits ${describeMoney({ amount: debit, currency })} ≠ credits ${describeMoney({ amount: credit, currency })}`,
    );
  }
  return offenders;
}
