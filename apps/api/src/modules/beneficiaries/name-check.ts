import { NameCheckResult } from '@reliance/contracts';

/**
 * Confirmation of Payee, simulated.
 *
 * The real scheme asks the receiving bank "is this account held by this name?" and gets
 * back one of three answers plus, on a near miss, the name actually on the account. This
 * module is the comparison half of that exchange; the lookup half is `PayeeNamePort`.
 *
 * Two decisions here are security decisions rather than matching decisions:
 *
 * - **A `NO_MATCH` carries no suggestion.** Returning the registered name for a wrong
 *   guess turns the endpoint into a name oracle: an attacker with a list of account
 *   numbers could read out the account holder for each one. The scheme itself withholds
 *   the name for exactly this reason, and so does this.
 * - **A `CLOSE_MATCH` does carry one**, because by then the customer has already
 *   demonstrated they know substantially who they are paying, and the whole value of the
 *   check is showing them the "Jonathan" they typed as "Jon".
 */

/** The outcome of comparing a typed name with the name on the account. */
export interface NameCheckVerdict {
  readonly result: NameCheckResult;
  /** The registered name, supplied only when it is safe to reveal. */
  readonly suggestion: string | null;
}

/** Honorifics and suffixes that carry no identifying information. */
const NOISE_WORDS = new Set([
  'mr',
  'mrs',
  'miss',
  'ms',
  'mx',
  'dr',
  'prof',
  'sir',
  'jr',
  'snr',
  'sr',
]);

/** Characters that vary with typing habits rather than with identity. */
const PUNCTUATION = /[^a-z0-9\s]/g;
const WHITESPACE = /\s+/g;

/** Longest edit distance still treated as a typo rather than a different person. */
const MAX_TYPO_DISTANCE = 2;

/**
 * How many of the typed words must land for the names to be "close".
 *
 * Written as an integer fraction rather than a decimal because a fractional literal is a
 * lint error in this tree — the rule exists to stop floats near money, and the honest
 * response is to express the ratio exactly rather than to silence it.
 */
const CLOSE_MATCH_NUMERATOR = 1;
const CLOSE_MATCH_DENOMINATOR = 2;

/**
 * Compares the name the customer typed with the name on the account.
 *
 * @param claimed What the customer entered for the payee.
 * @param registered The name the account is actually held in, or null when the receiving
 *   bank does not participate in the scheme.
 */
export function checkPayeeName(claimed: string, registered: string | null): NameCheckVerdict {
  if (registered === null) return { result: NameCheckResult.UNAVAILABLE, suggestion: null };

  const claimedTokens = tokenise(claimed);
  const registeredTokens = tokenise(registered);

  if (claimedTokens.length === 0 || registeredTokens.length === 0) {
    return { result: NameCheckResult.NO_MATCH, suggestion: null };
  }

  // Sorted, so word order is not part of identity: bank statements, passports and
  // address books disagree about whether the surname comes first, and "Lovelace, Ada" is
  // not a different person from "Ada Lovelace".
  if (sorted(claimedTokens) === sorted(registeredTokens)) {
    return { result: NameCheckResult.MATCH, suggestion: null };
  }

  return closeOrNoMatch(claimedTokens, registeredTokens, registered);
}

/**
 * Names that are not identical but may still be the same person.
 *
 * Word order is ignored — "Ada Lovelace" and "Lovelace, Ada" are one person — and each
 * typed word matches a registered word if it is that word, an initial of it, or within a
 * two-character typo of it.
 */
function closeOrNoMatch(
  claimed: readonly string[],
  registered: readonly string[],
  registeredName: string,
): NameCheckVerdict {
  const matched = claimed.filter((token) =>
    registered.some((against) => tokensAgree(token, against)),
  ).length;

  const considered = Math.max(claimed.length, registered.length);
  if (matched * CLOSE_MATCH_DENOMINATOR >= considered * CLOSE_MATCH_NUMERATOR) {
    return { result: NameCheckResult.CLOSE_MATCH, suggestion: registeredName };
  }

  return { result: NameCheckResult.NO_MATCH, suggestion: null };
}

/** One typed word against one registered word: equal, an initial, or a near-typo. */
function tokensAgree(claimed: string, registered: string): boolean {
  if (claimed === registered) return true;
  if (isInitialOf(claimed, registered) || isInitialOf(registered, claimed)) return true;
  return editDistanceWithin(claimed, registered, MAX_TYPO_DISTANCE);
}

function isInitialOf(initial: string, word: string): boolean {
  return initial.length === 1 && word.startsWith(initial);
}

/** The tokens as one order-independent string, for the exact-match comparison. */
function sorted(tokens: readonly string[]): string {
  return [...tokens].sort((left, right) => left.localeCompare(right)).join(' ');
}

/** Lower-cases, drops punctuation and honorifics, and splits into comparable words. */
function tokenise(name: string): string[] {
  return name
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token));
}

/**
 * Levenshtein distance, abandoned once it provably exceeds `limit`.
 *
 * The early exit is not an optimisation for speed — names are short — but a guard on
 * behaviour: without it, two long and entirely different words would still be compared
 * character by character to produce a number nobody reads.
 */
export function editDistanceWithin(left: string, right: string, limit: number): boolean {
  if (Math.abs(left.length - right.length) > limit) return false;

  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row, ...new Array<number>(right.length).fill(0)];

    for (let column = 1; column <= right.length; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + substitution,
      );
    }

    if (Math.min(...current) > limit) return false;
    previous = current;
  }

  return (previous[right.length] ?? limit + 1) <= limit;
}
