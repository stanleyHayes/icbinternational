import { Test, type TestingModule } from '@nestjs/testing';

import { LedgerVerifierService } from '../../../modules/ledger/ledger-verifier.service.js';
import { ShowcaseModule } from '../showcase.module.js';
import { ShowcaseService } from '../showcase.service.js';

/**
 * The claim this file exists to test: a generated bank's book balances.
 *
 * The generator posts thousands of movements through `PostingService` across eight
 * customers and two years. Every one of them renders perfectly on screen whether or not
 * the double entry holds, so the only way to know is to replay every posting from zero and
 * diff it against the stored balances. If this passes, the showcase dataset is a bank; if
 * it fails, it is a set of numbers that happen to look like one.
 */

const TEST_DB = 'reliancebank_showcase_test';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= `mongodb://localhost:27317/${TEST_DB}?replicaSet=rs0`;
process.env.MONGODB_DB = TEST_DB;
process.env.JWT_ACCESS_SECRET = 'showcase-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'showcase-test-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'showcase-test-csrf-secret';
process.env.ENCRYPTION_KEY = 'showcase-test-encryption-key-0123';
// Generating two years of history for eight customers is thousands of round trips.
process.env.ARGON2_MEMORY_KIB = '1024';
process.env.ARGON2_TIME_COST = '1';

jest.setTimeout(900_000);

/**
 * Opt-in, because it builds the entire dataset — eight customers, two years, thousands of
 * postings — and takes minutes. Running it on every `pnpm test` would make the suite too
 * slow to run habitually, and a suite nobody runs catches nothing.
 *
 *   pnpm --filter @reliance/api test:showcase
 */
const suite = process.env.RUN_SHOWCASE_TEST === '1' ? describe : describe.skip;

suite('the generated showcase dataset', () => {
  let moduleRef: TestingModule;
  let report: Awaited<ReturnType<ShowcaseService['run']>>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [ShowcaseModule] }).compile();
    await moduleRef.init();
    report = await moduleRef.get(ShowcaseService).run();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('builds every persona', () => {
    expect(report.personas).toHaveLength(8);
    expect(report.personas.map((persona) => persona.key)).toContain('newcomer');
  });

  it('posts a substantial history', () => {
    // Anything much below this means a persona silently generated nothing.
    expect(report.totalMovements).toBeGreaterThan(1_000);
  });

  it('leaves a ledger that reproduces every balance from its postings', async () => {
    const verification = await moduleRef.get(LedgerVerifierService).verify();

    expect(verification.unbalancedEntries).toEqual([]);
    expect(verification.ledgerAccountDrift).toEqual([]);
    expect(verification.customerAccountDrift).toEqual([]);
    expect(verification.healthy).toBe(true);
    expect(report.ledgerVerified).toBe(true);
  });

  it('keeps the trial balance at zero in every currency', async () => {
    const verification = await moduleRef.get(LedgerVerifierService).verify();

    for (const line of verification.trialBalance) {
      expect(line.balanced).toBe(true);
    }
  });

  it('holds the control total: customer balances equal GL 2000', async () => {
    const verification = await moduleRef.get(LedgerVerifierService).verify();

    // The bank's defining identity. It can fail even when no individual balance has
    // drifted — a posting that reached the control account without naming a customer
    // would do it — which is why it is asserted separately.
    expect(verification.controlTotals.length).toBeGreaterThan(0);
    for (const total of verification.controlTotals) {
      expect(total.matched).toBe(true);
    }
  });

  it('gives the unverified persona no accounts, so the empty states are reachable', () => {
    const newcomer = report.personas.find((persona) => persona.key === 'newcomer');
    expect(newcomer?.accounts).toHaveLength(0);
    expect(newcomer?.movements).toBe(0);
  });
});
