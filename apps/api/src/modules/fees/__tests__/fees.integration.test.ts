import { createConnection, type Connection } from 'mongoose';

import {
  EntryType,
  FeeKind,
  PostingDirection,
  SpendCategory,
  type Product,
} from '@reliance/contracts';
import { Money } from '@reliance/money';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { GL } from '../../../domain/ledger/index.js';
import { EVERYDAY_CURRENT } from '../../../seed/foundation/catalogue/everyday-current.product.js';
import { FeeWaiver, type ProductVersionDraft } from '../../products/index.js';
import { FEE_REFERENCE_PREFIX } from '../fees.constants.js';

import {
  buildServices,
  CONNECT_TIMEOUT_MS,
  MONGO_URI,
  openAccount,
  registerModels,
  replicaSetAvailable,
  seedChart,
  type RigModels,
  type RigServices,
} from './fees.rig.js';

/**
 * The fees engine against a real replica set.
 *
 * Proves the task's acceptance criterion — fee income in the GL equals the sum of the
 * fee charge records, to the minor unit — and that replaying any charge (a retried job,
 * a double-fired event) never moves money twice. The clock is frozen so the charged
 * period is deterministic. The suite skips itself, loudly, when no replica set is up.
 */

process.env.NODE_ENV = 'test';
jest.setTimeout(60_000);

const NOW = new Date('2026-08-05T09:00:00.000Z');
const OPENING_MINOR = '100000';
const ATM_FEE_MINOR = 350n;
const MAINTENANCE_FLAT_MINOR = '3100';
const PRO_RATED_MINOR = 2200n;
const FULL_MONTH_MINOR = 3100n;
const EXPECTED_TOTAL_MINOR = ATM_FEE_MINOR + PRO_RATED_MINOR + FULL_MONTH_MINOR;
const CHARGED_ENTRY_COUNT = 3;

describe('the fees engine, against a replica set', () => {
  let available = false;
  let connection: Connection;
  let models: RigModels;
  let services: RigServices;
  let eventProduct: Product;
  let maintenanceProduct: Product;

  beforeAll(async () => {
    available = await replicaSetAvailable();
    if (!available) {
      console.warn('Skipping the fees integration suite: no MongoDB replica set reachable.');
      return;
    }

    connection = createConnection(MONGO_URI, {
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      dbName: `reliancebank_fees_test_${new IdGenerator().generate('auditEvent')}`,
    });
    await connection.asPromise();
    await connection.dropDatabase();

    models = registerModels(connection);
    await Promise.all(Object.values(models).map((model) => model.init()));

    services = buildServices(connection, models);
    services.clock.freezeAt(NOW);
    await seedChart(services.ledgerAccounts);

    eventProduct = await services.products.publishVersion(draft({ code: 'FEES_EVENT' }));
    maintenanceProduct = await services.products.publishVersion(
      draft({
        code: 'FEES_MAINT',
        fees: [maintenanceEntry()],
        monthlyFee: wire(MAINTENANCE_FLAT_MINOR),
      }),
    );
  });

  afterAll(async () => {
    if (!available) return;
    await connection.dropDatabase();
    await connection.close();
  });

  it('charges an event fee once the free allowance is spent, and replaying it moves nothing', async () => {
    const accountId = await openAccount(services, {
      product: eventProduct,
      openedAt: '2026-08-02T10:00:00.000Z',
      balanceMinor: OPENING_MINOR,
    });
    const amount = Money.fromMinor('10000', 'GBP');

    // Everyday Current: two free international withdrawals a month, then £1.50 plus 2%.
    const feeInput = { accountId, kind: FeeKind.ATM_INTERNATIONAL, amount } as const;
    const first = await services.charging.chargeEventFee({ ...feeInput, sourceId: 'aut_fee_1' });
    const second = await services.charging.chargeEventFee({ ...feeInput, sourceId: 'aut_fee_2' });
    const third = await services.charging.chargeEventFee({ ...feeInput, sourceId: 'aut_fee_3' });

    expect(first.waivedBy).toBe(FeeWaiver.FREE_ALLOWANCE);
    expect(second.waivedBy).toBe(FeeWaiver.FREE_ALLOWANCE);
    expect(third.waivedBy).toBeNull();
    expect(third.amount.amount).toBe(ATM_FEE_MINOR.toString());
    expect(third.journalEntryId).toMatch(/^jnl_/);

    const replay = await services.charging.chargeEventFee({ ...feeInput, sourceId: 'aut_fee_3' });
    expect(replay.id).toBe(third.id);

    const reference = `${FEE_REFERENCE_PREFIX}${FeeKind.ATM_INTERNATIONAL}:aut_fee_3`;
    const entries = await models.journalEntry.find({ reference }).lean();
    expect(entries).toHaveLength(1);

    const postings = entries[0]?.postings ?? [];
    expect(postings).toHaveLength(2);
    expect(postings).toContainEqual(
      expect.objectContaining({
        ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
        accountId,
        direction: PostingDirection.DEBIT,
        amount: expect.objectContaining({ amount: ATM_FEE_MINOR.toString() }),
      }),
    );
    expect(postings).toContainEqual(
      expect.objectContaining({
        ledgerAccountCode: GL.FEE_INCOME,
        accountId: null,
        direction: PostingDirection.CREDIT,
        amount: expect.objectContaining({ amount: ATM_FEE_MINOR.toString() }),
      }),
    );

    const account = await services.accounts.findById(accountId);
    expect(account?.ledgerBalance.amount).toBe((BigInt(OPENING_MINOR) - ATM_FEE_MINOR).toString());
  });

  it('waives an event fee for a tiered customer without booking anything', async () => {
    const accountId = await openAccount(services, {
      product: eventProduct,
      openedAt: '2026-08-02T10:00:00.000Z',
      balanceMinor: OPENING_MINOR,
    });

    const charge = await services.premier.chargeEventFee({
      accountId,
      kind: FeeKind.ATM_INTERNATIONAL,
      amount: Money.fromMinor('10000', 'GBP'),
      sourceId: 'aut_premier_1',
    });

    expect(charge.waivedBy).toBe(FeeWaiver.TIER);
    expect(charge.amount.amount).toBe('0');
    expect(charge.journalEntryId).toBeNull();
  });

  it('charges maintenance in arrears, pro-rated to the days the account was open', async () => {
    const opened = (openedAt: string) =>
      openAccount(services, { product: maintenanceProduct, openedAt, balanceMinor: OPENING_MINOR });
    const partial = await opened('2026-07-10T09:00:00.000Z');
    const full = await opened('2026-05-01T09:00:00.000Z');
    await opened('2026-08-01T09:00:00.000Z');

    const sweep = await services.maintenance.chargeDueMaintenance();
    expect(sweep).toMatchObject({ period: '2026-07', charged: 2, waived: 0, failed: 0 });

    const partialCharges = await models.feeCharge.find({ accountId: partial }).lean();
    const fullCharges = await models.feeCharge.find({ accountId: full }).lean();
    expect(partialCharges[0]).toMatchObject({
      periodKey: '2026-07',
      amount: { amount: PRO_RATED_MINOR.toString() },
    });
    expect(fullCharges[0]).toMatchObject({
      periodKey: '2026-07',
      amount: { amount: FULL_MONTH_MINOR.toString() },
    });

    // A second run — a retried job — must not move a single minor unit more.
    await services.maintenance.chargeDueMaintenance();
    const totals = await services.income.feeIncomeTotals();
    expect(totals.find((total) => total.currency === 'GBP')?.totalMinor).toBe(EXPECTED_TOTAL_MINOR);
  });

  it('acceptance: fee income in the GL equals the sum of the fee charges, to the minor unit', async () => {
    const report = await services.reconciliation.reconcile();

    expect(report.balanced).toBe(true);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toMatchObject({
      currency: 'GBP',
      glIncomeMinor: EXPECTED_TOTAL_MINOR,
      chargedMinor: EXPECTED_TOTAL_MINOR,
      differenceMinor: 0n,
    });

    // The customer's statement lines tell the same story: one FEES row per charged fee.
    const rows = await models.transaction.find({ type: EntryType.FEE }).lean();
    expect(rows).toHaveLength(CHARGED_ENTRY_COUNT);

    let rowSum = 0n;
    for (const row of rows) {
      expect(row.category).toBe(SpendCategory.FEES);
      rowSum += BigInt(row.amount.amount);
    }
    expect(rowSum).toBe(EXPECTED_TOTAL_MINOR);
  });
});

function wire(amount: string): { amount: string; currency: 'GBP' } {
  return { amount, currency: 'GBP' };
}

function maintenanceEntry(): Product['fees'][number] {
  return {
    kind: FeeKind.MONTHLY_MAINTENANCE,
    label: 'Monthly account fee',
    flatAmount: wire(MAINTENANCE_FLAT_MINOR),
    rateBps: null,
    minAmount: null,
    maxAmount: null,
    freeAllowancePerMonth: 0,
    waivedForTiers: [],
  };
}

function draft(overrides: Partial<Product>): ProductVersionDraft {
  const full: Partial<Product> = { ...EVERYDAY_CURRENT, ...overrides };
  delete full.version;
  return full as ProductVersionDraft;
}
