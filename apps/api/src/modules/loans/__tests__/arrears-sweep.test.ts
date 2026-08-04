import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { fromStored } from '../../../common/money/money.codec.js';
import { type JournalEntry } from '../../../domain/ledger/index.js';
import { type PostingService } from '../../ledger/posting.service.js';
import { InMemoryLoanStore } from '../in-memory-loan.store.js';
import { LoanArrearsService } from '../loan-arrears.service.js';
import { LoanLedgerService } from '../loan-ledger.service.js';
import { DpdBucket, LoanStatus } from '../loan.types.js';

import { aLoan } from './loan-fixtures.js';

/**
 * The arrears sweep, driven by the simulated clock.
 *
 * This is the test that proves advancing the business date *produces* arrears rather than
 * merely allowing them: nothing here calls a detection method directly. The clock moves,
 * the sweep runs, and fees, buckets and provisions appear.
 *
 * Idempotency is the other half. The sweep is run repeatedly on the same date and after
 * the date has moved, and the assertion is always about how many entries reached the
 * ledger — because the failure mode that matters is charging a customer twice.
 */

/** Records what would have been booked, without a database or a replica set. */
function recordingPostings(): { service: PostingService; booked: JournalEntry[] } {
  const booked: JournalEntry[] = [];
  const service = {
    post: async (entry: JournalEntry) => {
      booked.push(entry);
      return null as never;
    },
  };

  return { service: service as unknown as PostingService, booked };
}

function harness() {
  const clock = new ClockService();
  const store = new InMemoryLoanStore(new IdGenerator());
  const { service: postings, booked } = recordingPostings();
  const arrears = new LoanArrearsService(store, new LoanLedgerService(postings, clock));

  return { clock, store, arrears, booked };
}

const FIRST_DUE_DATE = '2026-02-15';

function entriesOfType(booked: JournalEntry[], type: string): JournalEntry[] {
  return booked.filter((entry) => entry.type === type);
}

describe('the arrears sweep', () => {
  afterEach(() => {
    // The clock is process-wide; a frozen instant left behind would leak into other suites.
    new ClockService().reset();
  });

  it('finds nothing before the first instalment falls due', async () => {
    const { clock, store, arrears, booked } = harness();
    clock.freezeAt(new Date('2026-02-01T09:00:00.000Z'));
    const loan = await store.insert(aLoan());

    const position = await arrears.assess(loan, clock.today());

    expect(position.missedInstalments).toBe(0);
    expect(position.bucket).toBe(DpdBucket.CURRENT);
    expect(entriesOfType(booked, 'FEE')).toHaveLength(0);
  });

  it('produces a missed instalment and a late fee once the clock passes grace', async () => {
    const { clock, store, arrears, booked } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    const loan = await store.insert(aLoan());

    const position = await arrears.assess(loan, clock.today());

    expect(position.missedInstalments).toBe(1);
    expect(position.daysPastDue).toBe(10);
    expect(entriesOfType(booked, 'FEE')).toHaveLength(1);
  });

  it('moves the loan into arrears and holds a provision against it', async () => {
    const { clock, store, arrears } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    const loan = await store.insert(aLoan());

    await arrears.assess(loan, clock.today());
    const updated = await store.findById(loan.id);

    expect(updated?.status).toBe(LoanStatus.IN_ARREARS);
    expect(fromStored(updated?.provisionHeld ?? loan.provisionHeld).isPositive).toBe(true);
  });

  it('charges one late fee per missed instalment, however often the sweep runs', async () => {
    const { clock, store, arrears, booked } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    await store.insert(aLoan());

    await arrears.sweep();
    await arrears.sweep();
    await arrears.sweep();

    expect(entriesOfType(booked, 'FEE')).toHaveLength(1);
  });

  it('skips a loan already processed on the business date', async () => {
    const { clock, store, arrears } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    await store.insert(aLoan());

    expect(await arrears.sweep()).toBe(1);
    expect(await arrears.sweep()).toBe(0);
  });

  it('charges a second fee only when a second instalment is missed', async () => {
    const { clock, store, arrears, booked } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    await store.insert(aLoan());

    await arrears.sweep();
    clock.freezeAt(new Date('2026-03-25T09:00:00.000Z'));
    await arrears.sweep();

    expect(entriesOfType(booked, 'FEE')).toHaveLength(2);
  });

  it('walks the loan up the bucket ladder as the clock advances', async () => {
    const { clock, store, arrears } = harness();
    const loan = await store.insert(aLoan());

    const observed: DpdBucket[] = [];
    for (const asOf of ['2026-02-22', '2026-03-20', '2026-04-20', '2026-05-20']) {
      clock.freezeAt(new Date(`${asOf}T09:00:00.000Z`));
      const current = await store.findById(loan.id);
      if (!current) throw new Error('The loan vanished mid-sweep');
      observed.push((await arrears.assess(current, asOf)).bucket);
    }

    expect(observed).toEqual([
      DpdBucket.DPD_1_29,
      DpdBucket.DPD_30_59,
      DpdBucket.DPD_60_89,
      DpdBucket.DPD_90_PLUS,
    ]);
  });

  it('increases the allowance as the loan deteriorates, booking the movement each time', async () => {
    const { clock, store, arrears, booked } = harness();
    const loan = await store.insert(aLoan());

    for (const asOf of ['2026-02-22', '2026-04-20']) {
      clock.freezeAt(new Date(`${asOf}T09:00:00.000Z`));
      const current = await store.findById(loan.id);
      if (!current) throw new Error('The loan vanished mid-sweep');
      await arrears.assess(current, asOf);
    }

    const provisions = entriesOfType(booked, 'MANUAL_ADJUSTMENT');
    expect(provisions.length).toBeGreaterThanOrEqual(2);
  });

  it('lists a loan in arrears on the collections queue, worst first', async () => {
    const { clock, store, arrears } = harness();
    clock.freezeAt(new Date('2026-05-20T09:00:00.000Z'));
    // The store mints its own ids, so two inserts of the same fixture are two loans.
    await store.insert(aLoan());
    await store.insert(aLoan());

    await arrears.sweep();
    const queue = await arrears.listArrears();

    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0]?.bucket).toBe(DpdBucket.DPD_90_PLUS);
  });

  it('narrows the collections queue to one bucket when asked', async () => {
    const { clock, store, arrears } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    await store.insert(aLoan());
    await arrears.sweep();

    expect(await arrears.listArrears(DpdBucket.DPD_1_29)).toHaveLength(1);
    expect(await arrears.listArrears(DpdBucket.DPD_90_PLUS)).toHaveLength(0);
  });

  it('charges no fee on a loan that is up to date, only the collective allowance', async () => {
    const { clock, store, arrears, booked } = harness();
    clock.freezeAt(new Date('2026-01-20T09:00:00.000Z'));
    await store.insert(aLoan());

    await arrears.sweep();

    // A performing exposure still carries a 1% collective allowance — that is the model,
    // not a bug — but nothing is charged to the customer.
    expect(entriesOfType(booked, 'FEE')).toHaveLength(0);
    expect(entriesOfType(booked, 'MANUAL_ADJUSTMENT')).toHaveLength(1);
  });

  it('marks the instalment table so the customer can see which payment was missed', async () => {
    const { clock, store, arrears } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    const loan = await store.insert(aLoan());

    await arrears.assess(loan, clock.today());
    const updated = await store.findById(loan.id);

    expect(updated?.schedule[0]?.status).toBe('OVERDUE');
    expect(updated?.schedule[1]?.status).toBe('SCHEDULED');
  });

  it('records the date it last ran, so the ledger is never asked twice for a day', async () => {
    const { clock, store, arrears } = harness();
    clock.freezeAt(new Date('2026-02-25T09:00:00.000Z'));
    const loan = await store.insert(aLoan());

    await arrears.assess(loan, clock.today());

    expect((await store.findById(loan.id))?.lastArrearsRunOn).toBe('2026-02-25');
  });

  it('dates the first instalment where the fixture says, so the ladder is meaningful', () => {
    expect(aLoan().schedule[0]?.dueDate).toBe(FIRST_DUE_DATE);
  });
});
