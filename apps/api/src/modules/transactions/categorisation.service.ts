import { Injectable } from '@nestjs/common';

import { SpendCategory, type EntryType } from '@reliance/contracts';

import {
  CATEGORY_BY_ENTRY_TYPE,
  ENTRY_TYPES_IGNORING_MCC,
} from './categorisation/entry-type-table.js';
import { MCC_EXACT, MCC_RANGES } from './categorisation/mcc-table.js';

/** Everything the classifier is allowed to look at. */
export interface CategorisationInput {
  readonly type: EntryType;
  /** ISO 18245 merchant category code, when the movement came from a card rail. */
  readonly mcc: string | null;
  /**
   * The category the customer has already chosen for this row, if any.
   *
   * Present so the decision is made in one place rather than by every caller
   * remembering to check a flag before asking.
   */
  readonly override?: SpendCategory | null;
}

/**
 * Decides what a movement means to the person who made it.
 *
 * The precedence is deliberate and is the whole design:
 *
 * 1. **The customer.** An override is never re-derived, never "improved", and never
 *    reconsidered when the table changes. Someone who files their gym under Health has
 *    told the bank something true that no merchant code can express, and a system that
 *    quietly reverts that decision teaches them not to bother.
 * 2. **The merchant code**, for entry types where it describes the spend rather than
 *    something adjacent to it.
 * 3. **The entry type**, which is always present and always honest about what the ledger
 *    thought it was doing.
 *
 * Classification is pure: same input, same answer, no clock, no database. That is what
 * makes it safe to re-run over a customer's history when the table gains a code.
 */
@Injectable()
export class CategorisationService {
  /** Resolves the category for one movement. */
  categorise(input: CategorisationInput): SpendCategory {
    if (input.override) return input.override;

    const fromMerchant = this.fromMcc(input.type, input.mcc);
    return fromMerchant ?? CATEGORY_BY_ENTRY_TYPE[input.type];
  }

  /**
   * The merchant code's opinion, or null if it has none worth hearing.
   *
   * Null rather than `UNCATEGORISED` so the caller can fall through to the entry type;
   * returning a category here would end the chain with the weakest answer available.
   */
  fromMcc(type: EntryType, mcc: string | null): SpendCategory | null {
    if (!mcc || ENTRY_TYPES_IGNORING_MCC.has(type)) return null;

    const exact = MCC_EXACT.get(mcc);
    if (exact) return exact;

    const code = Number.parseInt(mcc, 10);
    if (Number.isNaN(code)) return null;

    return MCC_RANGES.find((range) => code >= range.from && code <= range.to)?.category ?? null;
  }
}
