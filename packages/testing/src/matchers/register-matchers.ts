/**
 * Matcher registration — the single place the custom matchers are wired into Jest,
 * and the single place their type-level surface is declared.
 */

import type { MoneyLike } from './money-like.js';
import { toBalance } from './to-balance.js';
import { toEqualMoney } from './to-equal-money.js';

/** The matcher map handed to `expect.extend`. */
export const relianceMatchers = {
  toEqualMoney,
  toBalance,
} as const;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // The type parameter list must mirror @types/jest exactly for the merge to apply.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type
    interface Matchers<R, T = {}> {
      /** Asserts amount and currency are equal, across `Money` / wire / document shapes. */
      toEqualMoney(expected: MoneyLike): R;
      /** Asserts a posting set (or `{ postings }` object) balances per currency. */
      toBalance(): R;
    }
  }
}
