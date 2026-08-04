import { ErrorCode, HoldReason } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { movementEntries, productEntries, type JournalEntry } from '../../domain/ledger/index.js';

import { type HoldRecord } from './hold.store.js';

/**
 * Which journal entry a capture books, decided by why the hold was placed.
 *
 * Capture is where a promise becomes a movement, and the movement is not the same in
 * every case: a card authorisation settles against the card network, a pending transfer
 * settles into the outbound clearing account. Mapping reason to recipe keeps the ledger's
 * vocabulary finite and named — the caller cannot invent a fifth way to move a pound —
 * while letting each business event book the entry that is actually true of it.
 *
 * Reasons absent from the table are not capturable, and that is a statement about the
 * business rather than an omission. A compliance review, a court order, a dispute and a
 * manual lien all exist to stop money moving; they end by being lifted, never by the bank
 * helping itself to the funds. Asking to capture one is a bug in the caller.
 */
const CAPTURE_RECIPES: Partial<Record<HoldReason, (input: CaptureEntryInput) => JournalEntry>> = {
  [HoldReason.CARD_AUTHORISATION]: (input) =>
    productEntries.cardPurchase({
      reference: input.reference,
      accountId: input.hold.accountId,
      amount: input.amount,
      description: input.description,
      valueDate: input.valueDate,
      bookedAt: input.bookedAt,
      metadata: metadataFor(input),
    }),

  [HoldReason.PENDING_TRANSFER]: (input) =>
    movementEntries.outboundTransfer({
      reference: input.reference,
      fromAccountId: input.hold.accountId,
      amount: input.amount,
      // The fee, if any, was priced and booked when the transfer was created; capturing
      // the hold moves the principal only and must not charge for it a second time.
      fee: Money.zero(input.amount.currency),
      type: 'DOMESTIC_TRANSFER',
      description: input.description,
      valueDate: input.valueDate,
      bookedAt: input.bookedAt,
      metadata: metadataFor(input),
    }),
};

/** What the recipe needs beyond the hold itself. */
export interface CaptureEntryInput {
  readonly hold: HoldRecord;
  /** What is actually taken — at most the hold, often less. */
  readonly amount: Money;
  readonly reference: string;
  readonly description: string;
  readonly valueDate: string;
  readonly bookedAt: Date;
}

/**
 * Builds the entry for this capture.
 *
 * @throws {AppError} `PRECONDITION_FAILED` when the hold's reason has no capture path.
 */
export function captureEntryFor(input: CaptureEntryInput): JournalEntry {
  const recipe = CAPTURE_RECIPES[input.hold.reason];

  if (!recipe) {
    throw new AppError({
      code: ErrorCode.PRECONDITION_FAILED,
      message: `A ${describe(input.hold.reason)} hold is lifted, never captured.`,
      context: { holdId: input.hold.id, reason: input.hold.reason },
    });
  }

  return recipe(input);
}

/** Whether a hold of this reason can ever be captured. */
export function isCapturable(reason: HoldReason): boolean {
  return CAPTURE_RECIPES[reason] !== undefined;
}

/** The hold is carried on the entry so a statement line can be traced back to it. */
function metadataFor(input: CaptureEntryInput): Record<string, string> {
  return {
    holdId: input.hold.id,
    ...(input.hold.authorisationId ? { authorisationId: input.hold.authorisationId } : {}),
  };
}

function describe(reason: HoldReason): string {
  return reason.toLowerCase().replaceAll('_', ' ');
}
