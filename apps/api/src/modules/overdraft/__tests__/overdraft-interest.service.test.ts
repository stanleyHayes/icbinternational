import { Money } from '@reliance/money';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type JournalEntry } from '../../../domain/ledger/index.js';
import { frozenClock, gbp, retryingRunner, seedAccount, TEST_USER } from '../../accounts/__tests__/accounts-harness.js';
import { AccountService, InMemoryAccountStore } from '../../accounts/index.js';
import { type PostingService } from '../../ledger/posting.service.js';
import { InMemoryOverdraftStore } from '../in-memory-overdraft.store.js';
import { OverdraftInterestService } from '../overdraft-interest.service.js';
import { OverdraftStatus, type NewOverdraft, type OverdraftRecord } from '../overdraft.store.js';

/**
 * Records what was posted without touching a ledger.
 *
 * The interest service's contract with the ledger is entirely in the entries it hands over
 * — the reference, the amount and the direction — so capturing them is the whole assertion
 * surface. Posting for real would test `PostingService`, which has its own suite.
 */
class RecordingPoster {
  readonly posted: JournalEntry[] = [];

  async post(entry: JournalEntry): Promise<unknown> {
    await Promise.resolve();
    this.posted.push(entry);
    return { id: 'jnl_stub', reference: entry.reference };
  }

  /** Every reference posted, which is what idempotency is keyed on. */
  get references(): string[] {
    return this.posted.map((entry) => entry.reference);
  }
}

interface Rig {
  accounts: InMemoryAccountStore;
  facilities: InMemoryOverdraftStore;
  poster: RecordingPoster;
  clock: ClockService;
  service: OverdraftInterestService;
}

/** Inserts a facility and returns it as stored, id included. */
async function seedFacility(
  facilities: InMemoryOverdraftStore,
  record: NewOverdraft,
): Promise<OverdraftRecord> {
  const result = await facilities.insertIfNoActiveFacility(record);
  if (!result.facility) throw new Error('Fixture facility collided with a live one.');
  return result.facility;
}

function rig(): Rig {
  const accounts = new InMemoryAccountStore();
  const facilities = new InMemoryOverdraftStore(new IdGenerator());
  const poster = new RecordingPoster();
  const clock = frozenClock();
  const service = new OverdraftInterestService(
    facilities,
    new AccountService(accounts, clock, retryingRunner()),
    poster as unknown as PostingService,
    clock,
  );

  return { accounts, facilities, poster, clock, service };
}

/**
 * A live facility on `accountId`, drawn or not according to the account's balance.
 *
 * Returned without an id: `insertIfNoActiveFacility` mints one, and a fixture that carried
 * its own would be asserting against a value the store discards.
 */
function facility(accountId: string, overrides: Partial<NewOverdraft> = {}): NewOverdraft {
  return {
    userId: TEST_USER,
    accountId,
    status: OverdraftStatus.ACTIVE,
    requestedLimit: toStored(gbp(50_000)),
    limit: toStored(gbp(50_000)),
    aprBps: 3990,
    sweepFromAccountId: null,
    declineReasons: [],
    requestedAt: new Date('2026-01-01T00:00:00.000Z'),
    decidedAt: new Date('2026-01-01T00:00:00.000Z'),
    closedAt: null,
    lastAccruedOn: null,
    interestChargedToDate: toStored(Money.zero('GBP')),
    ...overrides,
  };
}

describe('OverdraftInterestService.chargeOne', () => {
  it('charges nothing on an account that is in credit', async () => {
    const { accounts, service, poster, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(25_000) });
    const record = await seedFacility(facilities, facility(accountId));

    const charged = await service.chargeOne(record, '2026-03-01');

    expect(charged.isZero).toBe(true);
    expect(poster.posted).toHaveLength(0);
  });

  it('stamps the accrual date even when nothing was charged', async () => {
    // Otherwise an account in credit is re-examined every run, and the "have we done
    // today" check stops being a single indexed comparison.
    const { accounts, service, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(25_000) });
    const record = await seedFacility(facilities, facility(accountId));

    await service.chargeOne(record, '2026-03-01');

    expect((await facilities.findById(record.id))?.lastAccruedOn).toBe('2026-03-01');
  });

  it('posts an interest debit on an overdrawn account', async () => {
    const { accounts, service, poster, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-30_000) });
    const record = await seedFacility(facilities, facility(accountId));

    const charged = await service.chargeOne(record, '2026-03-01');

    expect(charged.isPositive).toBe(true);
    expect(poster.posted).toHaveLength(1);
    expect(poster.posted[0]?.description).toBe('Overdraft interest');
  });

  it('accumulates the lifetime interest figure across days', async () => {
    const { accounts, service, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-30_000) });
    const record = await seedFacility(facilities, facility(accountId));

    const first = await service.chargeOne(record, '2026-03-01');
    const second = await service.chargeOne(
      (await facilities.findById(record.id))!,
      '2026-03-02',
    );

    const stored = await facilities.findById(record.id);
    expect(stored?.interestChargedToDate.amount).toBe(first.plus(second).amount.toString());
  });

  it('derives a reference that repeats for the same facility, movement and date', async () => {
    // This is the whole idempotency story: a retried job re-posts the same reference, and
    // the ledger's unique index turns the second attempt into a no-op.
    const { accounts, service, poster, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-30_000) });
    const record = await seedFacility(facilities, facility(accountId));

    await service.chargeOne(record, '2026-03-01');
    await service.chargeOne(record, '2026-03-01');

    expect(poster.references[0]).toBe(poster.references[1]);
    expect(poster.references[0]).toContain(record.id);
  });
});

describe('OverdraftInterestService.sweep', () => {
  it('does nothing when no funding account is nominated', async () => {
    const { accounts, service, poster, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-30_000) });

    const record = await seedFacility(facilities, facility(accountId, { sweepFromAccountId: null }));

    const swept = await service.sweep(record);

    expect(swept.isZero).toBe(true);
    expect(poster.posted).toHaveLength(0);
  });

  it('does nothing when the account is not overdrawn', async () => {
    const { accounts, service, poster, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(10_000) });
    const fundingId = await seedAccount(accounts, { ledger: gbp(100_000) });

    const record = await seedFacility(
      facilities,
      facility(accountId, { sweepFromAccountId: fundingId }),
    );

    const swept = await service.sweep(record);

    expect(swept.isZero).toBe(true);
    expect(poster.posted).toHaveLength(0);
  });

  it('clears the whole shortfall when the funding account can cover it', async () => {
    const { accounts, service, poster, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-30_000) });
    const fundingId = await seedAccount(accounts, { ledger: gbp(100_000) });

    const record = await seedFacility(
      facilities,
      facility(accountId, { sweepFromAccountId: fundingId }),
    );

    const swept = await service.sweep(record);

    expect(swept.amount).toBe(30_000n);
    expect(poster.posted[0]?.description).toBe('Overdraft repayment');
  });

  it('sweeps only what the funding account can spare', async () => {
    // Partial by design: £40 available against £100 overdrawn leaves the customer £60
    // overdrawn, rather than the sweep refusing because it cannot finish.
    const { accounts, service, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-10_000) });
    const fundingId = await seedAccount(accounts, { ledger: gbp(4_000) });

    const record = await seedFacility(
      facilities,
      facility(accountId, { sweepFromAccountId: fundingId }),
    );

    const swept = await service.sweep(record);

    expect(swept.amount).toBe(4_000n);
  });

  it('does nothing when the funding account is empty', async () => {
    const { accounts, service, poster, facilities } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-10_000) });
    const fundingId = await seedAccount(accounts, { ledger: gbp(0) });

    const record = await seedFacility(
      facilities,
      facility(accountId, { sweepFromAccountId: fundingId }),
    );

    const swept = await service.sweep(record);

    expect(swept.isZero).toBe(true);
    expect(poster.posted).toHaveLength(0);
  });
});

describe('OverdraftInterestService.runDailyCharge', () => {
  it('reports how many facilities it processed', async () => {
    const { accounts, facilities, service } = rig();
    const first = await seedAccount(accounts, { ledger: gbp(-30_000) });
    const second = await seedAccount(accounts, { ledger: gbp(-5_000) });
    await seedFacility(facilities, facility(first));
    await seedFacility(facilities, facility(second));

    await expect(service.runDailyCharge()).resolves.toBe(2);
  });

  it('charges before sweeping, so a swept day is still paid for', async () => {
    // Sweeping first would clear the balance and the customer would pay nothing for the
    // days they were actually overdrawn.
    const { accounts, facilities, service, poster } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp(-30_000) });
    const fundingId = await seedAccount(accounts, { ledger: gbp(100_000) });
    await seedFacility(facilities, facility(accountId, { sweepFromAccountId: fundingId }));

    await service.runDailyCharge();

    expect(poster.posted.map((entry) => entry.description)).toEqual([
      'Overdraft interest',
      'Overdraft repayment',
    ]);
  });

  it('returns zero when nothing is due', async () => {
    const { service } = rig();

    await expect(service.runDailyCharge()).resolves.toBe(0);
  });
});
