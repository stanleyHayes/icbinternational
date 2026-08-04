/**
 * The vocabulary the seed layer reports in.
 *
 * Every seeder answers the same question — what did this run actually change? — because
 * the only useful assertion about a seed is that the second run changes nothing. A
 * seeder that reported only "done" could not be tested for that.
 */

/** What one seeder did to one collection. */
export interface SeedOutcome {
  /** Mongo collection written to. */
  readonly collection: string;
  /** Documents that did not exist and were created. */
  readonly inserted: number;
  /** Documents whose seeded content had changed and were rewritten. */
  readonly updated: number;
  /** Documents already byte-identical to the seed definition. */
  readonly unchanged: number;
}

/** True when a run was a genuine no-op. The idempotency contract, in one function. */
export function isNoOp(outcomes: readonly SeedOutcome[]): boolean {
  return outcomes.every((outcome) => outcome.inserted === 0 && outcome.updated === 0);
}

/** Adds up several outcomes for the summary line. */
export function totalise(outcomes: readonly SeedOutcome[]): Omit<SeedOutcome, 'collection'> {
  return outcomes.reduce(
    (total, outcome) => ({
      inserted: total.inserted + outcome.inserted,
      updated: total.updated + outcome.updated,
      unchanged: total.unchanged + outcome.unchanged,
    }),
    { inserted: 0, updated: 0, unchanged: 0 },
  );
}

/** A unit of foundation data. Named so the summary can attribute a change to a source. */
export interface Seeder {
  readonly name: string;
  run(): Promise<SeedOutcome>;
}

/**
 * Injection token for the ordered list of seeders.
 *
 * `SeedService` takes the list rather than each seeder, so adding a sixth is a change to
 * the module's provider list and not to the service — and the service stays within the
 * four-parameter budget however many collections the foundation grows to.
 */
export const SEEDERS = Symbol('SEEDERS');
