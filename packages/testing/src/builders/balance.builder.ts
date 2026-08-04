/**
 * Fluent builder for the contract `Balance` projection.
 *
 * Defaults to a consistent position: ledger £1,250.00, £200.00 held, no overdraft,
 * so `available = ledger − held`. Overrides keep the invariant unless a test
 * deliberately breaks it — in which case set every field explicitly.
 */

import { balanceSchema, type Balance } from '@reliance/contracts';

import { Builder, DEFAULT_INSTANT } from './builder.js';
import { aMoney, type MinorUnitsInput } from './money.builder.js';

/** Default: £1,250.00 booked, £200.00 held, no overdraft facility. */
const DEFAULT_HELD_MINOR = 20_000n;

/** Builds contract-valid {@link Balance} projections. */
export class BalanceBuilder extends Builder<Balance> {
  private ledger = aMoney().buildJSON();
  private held = aMoney().withMinor(DEFAULT_HELD_MINOR).buildJSON();
  private overdraftAvailable = aMoney().zero().buildJSON();
  private asOf: string = DEFAULT_INSTANT;

  /** Sets the booked (ledger) balance; available is derived unless overridden. */
  withLedger(amount: MinorUnitsInput): this {
    this.ledger = aMoney().withMinor(amount).buildJSON();
    return this;
  }

  /** Sets the held total. */
  withHeld(amount: MinorUnitsInput): this {
    this.held = aMoney().withMinor(amount).buildJSON();
    return this;
  }

  /** Sets the unused overdraft facility. */
  withOverdraftAvailable(amount: MinorUnitsInput): this {
    this.overdraftAvailable = aMoney().withMinor(amount).buildJSON();
    return this;
  }

  /** Sets the projection timestamp (ISO-8601 UTC). */
  withAsOf(isoDateTime: string): this {
    this.asOf = isoDateTime;
    return this;
  }

  build(): Balance {
    const ledgerMinor = BigInt(this.ledger.amount);
    const heldMinor = BigInt(this.held.amount);
    const overdraftMinor = BigInt(this.overdraftAvailable.amount);
    const available = aMoney()
      .withMinor(ledgerMinor - heldMinor + overdraftMinor)
      .buildJSON();

    return balanceSchema.parse({
      ledger: this.ledger,
      available,
      held: this.held,
      overdraftAvailable: this.overdraftAvailable,
      asOf: this.asOf,
    });
  }
}

/** Entry point: `aBalance().withLedger(500_000n).build()`. */
export function aBalance(): BalanceBuilder {
  return new BalanceBuilder();
}
