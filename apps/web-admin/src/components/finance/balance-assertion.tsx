/**
 * The statement that the book foots.
 *
 * Stated whether or not it is true, and stated in the same place every time. A ledger
 * that has stopped balancing is the one condition in this bank that outranks everything
 * else on the screen, so the failure is worded as an instruction rather than as a status:
 * an operator reading it needs to know to stop, not to know a field is non-zero.
 */

'use client';

import type { Money } from '@reliance/contracts';
import { Alert, MoneyText } from '@reliance/ui';

export interface BalanceAssertionProps {
  readonly balanced: boolean;
  /** Debits less credits. Zero on a book that foots. */
  readonly difference: Money;
  /** What was totalled: "this entry", "the general ledger", "the trial balance". */
  readonly subject: string;
}

/** Says whether debits equal credits, every time the figures are shown. */
export function BalanceAssertion({ balanced, difference, subject }: BalanceAssertionProps) {
  if (balanced) {
    return (
      <Alert tone="success" title="Debits equal credits">
        Every posting on {subject} is matched by an opposing posting of the same value.
      </Alert>
    );
  }

  return (
    <Alert tone="danger" title="This does not balance">
      <span className="flex flex-wrap items-center gap-1">
        Debits exceed credits on {subject} by
        <MoneyText amount={difference.amount} currency={difference.currency} size="sm" />.
      </span>
      Stop posting and raise this with Financial Control. A ledger that does not foot cannot be
      relied on for any other figure on this screen.
    </Alert>
  );
}
