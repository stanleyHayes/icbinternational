import { ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { type AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import {
  frozenClock,
  gbp,
  retryingRunner,
  seedAccount,
  TEST_USER,
} from '../../accounts/__tests__/accounts-harness.js';
import { AccountService, InMemoryAccountStore } from '../../accounts/index.js';
import { InMemoryOverdraftStore } from '../in-memory-overdraft.store.js';
import { type OverdraftAssessment } from '../overdraft-assessment.service.js';
import { type RequestOverdraftRequest } from '../overdraft.dto.js';
import { OverdraftSchema } from '../overdraft.schema.js';
import { OverdraftService } from '../overdraft.service.js';
import { OverdraftStatus } from '../overdraft.store.js';

/**
 * One account, one live facility.
 *
 * A second `ACTIVE` facility on an account is two limits and two agreements. Whichever the
 * store returns first decides the customer's available balance, and the other is a line of
 * credit nobody is watching. The request path reads for a live facility and *then* awaits a
 * credit decision, so the read cannot be what prevents it — the conditional write is, and
 * that is what the concurrency test here exercises.
 */

const GRANTED = gbp('50000');

/**
 * `OverdraftAssessment` reduced to the one call the request path makes.
 *
 * It awaits before answering, exactly as the real one does while it builds a credit
 * profile from the user record and the loan book. That await is the race window: a stub
 * that answered synchronously would close it and make the concurrency test prove nothing.
 */
class StubAssessment {
  constructor(
    readonly clock: ClockService,
    private readonly granted: Money,
  ) {}

  async sizeFor(): Promise<Money> {
    await Promise.resolve();
    return this.granted;
  }
}

interface OverdraftRig {
  accounts: InMemoryAccountStore;
  facilities: InMemoryOverdraftStore;
  service: OverdraftService;
  clock: ClockService;
}

/**
 * The error a call was expected to refuse with.
 *
 * Fails loudly when the call succeeds, so a test can never pass by asserting properties on
 * a value that was never an error.
 */
async function refusal(promise: Promise<unknown>): Promise<AppError> {
  return promise.then(
    () => {
      throw new Error('Expected the call to be refused, but it succeeded.');
    },
    (error: unknown) => error as AppError,
  );
}

/** The overdraft lane over in-memory stores, with the credit decision stubbed. */
function overdraftRig(granted: Money = GRANTED): OverdraftRig {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();
  const runner = retryingRunner();
  const facilities = new InMemoryOverdraftStore(new IdGenerator());
  const assessment = new StubAssessment(clock, granted) as unknown as OverdraftAssessment;

  return {
    accounts,
    facilities,
    clock,
    service: new OverdraftService(
      facilities,
      new AccountService(accounts, clock, runner),
      accounts,
      assessment,
      runner,
    ),
  };
}

function overdraftRequest(accountId: string): RequestOverdraftRequest {
  return {
    accountId,
    requestedLimit: gbp('50000').toJSON(),
    monthlyIncome: gbp('250000').toJSON(),
    monthlyDebtPayments: gbp('20000').toJSON(),
    employmentMonths: 36,
  };
}

/** Live facilities on an account, which is the number that must never exceed one. */
function activeCount(rig: OverdraftRig, accountId: string): number {
  return rig.facilities
    .all()
    .filter(
      (facility) => facility.accountId === accountId && facility.status === OverdraftStatus.ACTIVE,
    ).length;
}

describe('requesting an overdraft', () => {
  it('grants exactly one facility when two requests race', async () => {
    const rig = overdraftRig();
    const accountId = await seedAccount(rig.accounts);
    const request = overdraftRequest(accountId);

    const outcomes = await Promise.allSettled([
      rig.service.request(TEST_USER, request),
      rig.service.request(TEST_USER, request),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(activeCount(rig, accountId)).toBe(1);
  });

  it('refuses the loser of a race rather than granting a second limit', async () => {
    const rig = overdraftRig();
    const accountId = await seedAccount(rig.accounts);
    const request = overdraftRequest(accountId);

    const outcomes = await Promise.allSettled([
      rig.service.request(TEST_USER, request),
      rig.service.request(TEST_USER, request),
    ]);

    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect((rejected?.reason as AppError).code).toBe(ErrorCode.CONFLICT);
  });

  it('writes exactly one limit onto the account when two requests race', async () => {
    const rig = overdraftRig();
    const accountId = await seedAccount(rig.accounts);
    const request = overdraftRequest(accountId);

    await Promise.allSettled([
      rig.service.request(TEST_USER, request),
      rig.service.request(TEST_USER, request),
    ]);

    const account = await rig.accounts.findById(accountId);
    expect(Money.fromMinor(account?.overdraftLimit.amount ?? '0', 'GBP').equals(GRANTED)).toBe(
      true,
    );
  });

  it('tells a customer who already has one to ask for a limit change instead', async () => {
    const rig = overdraftRig();
    const accountId = await seedAccount(rig.accounts);
    await rig.service.request(TEST_USER, overdraftRequest(accountId));

    const failure = await refusal(rig.service.request(TEST_USER, overdraftRequest(accountId)));

    expect(failure.code).toBe(ErrorCode.CONFLICT);
    expect(failure.message).toContain('already has an overdraft');
  });

  it('makes the granted limit spendable on the account', async () => {
    const rig = overdraftRig();
    const accountId = await seedAccount(rig.accounts);

    const facility = await rig.service.request(TEST_USER, overdraftRequest(accountId));

    expect(facility.status).toBe(OverdraftStatus.ACTIVE);
    const account = await rig.accounts.findById(accountId);
    expect(account?.overdraftLimit.amount).toBe(GRANTED.amount.toString());
  });

  it('leaves the account alone when the request is declined', async () => {
    const rig = overdraftRig(Money.zero('GBP'));
    const accountId = await seedAccount(rig.accounts);

    const facility = await rig.service.request(TEST_USER, overdraftRequest(accountId));

    expect(facility.status).toBe(OverdraftStatus.DECLINED);
    expect(facility.declineReasons).toHaveLength(1);
    const account = await rig.accounts.findById(accountId);
    expect(account?.overdraftLimit.amount).toBe('0');
  });

  it('lets a customer who was declined ask again', async () => {
    const rig = overdraftRig(Money.zero('GBP'));
    const accountId = await seedAccount(rig.accounts);
    await rig.service.request(TEST_USER, overdraftRequest(accountId));

    // A decline is history, not a live facility. Only ACTIVE and SUSPENDED block a request.
    await expect(rig.service.request(TEST_USER, overdraftRequest(accountId))).resolves.toEqual(
      expect.objectContaining({ status: OverdraftStatus.DECLINED }),
    );
  });
});

describe('the facility collection', () => {
  it('declares a unique partial index over active facilities per account', () => {
    const index = OverdraftSchema.indexes().find(([fields]) => 'accountId' in fields);

    expect(index?.[0]).toEqual({ accountId: 1 });
    expect(index?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { status: OverdraftStatus.ACTIVE },
    });
  });
});

describe('closing a facility', () => {
  it('takes the limit off the account and frees the customer to ask again', async () => {
    const rig = overdraftRig();
    const accountId = await seedAccount(rig.accounts);
    await rig.service.request(TEST_USER, overdraftRequest(accountId));

    const closed = await rig.service.close(TEST_USER, accountId);

    expect(closed.status).toBe(OverdraftStatus.CLOSED);
    const account = await rig.accounts.findById(accountId);
    expect(account?.overdraftLimit.amount).toBe('0');
    expect(activeCount(rig, accountId)).toBe(0);
  });

  it('refuses to close a facility that is still drawn', async () => {
    const rig = overdraftRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('-10000') });
    await rig.service.request(TEST_USER, overdraftRequest(accountId));

    const failure = await refusal(rig.service.close(TEST_USER, accountId));

    expect(failure.code).toBe(ErrorCode.PRECONDITION_FAILED);
    const account = await rig.accounts.findById(accountId);
    expect(account?.overdraftLimit.amount).toBe(GRANTED.amount.toString());
  });
});
