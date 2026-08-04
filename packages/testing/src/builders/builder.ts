/**
 * Shared base for the fluent test-data builders.
 *
 * A builder carries a draft of the object under construction; every `with*` method
 * returns `this` so overrides chain, and `build()` validates the result against the
 * contract zod schema before handing it over — a builder that can produce invalid
 * data is a fixture generator, not a builder.
 */

/** Contract-valid test-data builder. */
export abstract class Builder<T> {
  /** Validates and returns the built object. */
  abstract build(): T;

  /** Builds `count` distinct objects. */
  buildMany(count: number): T[] {
    return Array.from({ length: count }, () => this.build());
  }
}

/** Fixed instant used for builder defaults, so snapshots never drift. */
export const DEFAULT_INSTANT = '2026-01-15T09:30:00.000Z';

/** Fixed calendar date used for builder defaults. */
export const DEFAULT_DATE = '2026-01-15';
