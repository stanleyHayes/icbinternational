import { type Connection, type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { TransactionRunner } from '../transaction.runner.js';

/**
 * The retry policy, which is a money-safety rule rather than a resilience nicety.
 *
 * MongoDB distinguishes two transient failures and they demand opposite responses:
 *
 * - `TransientTransactionError` — nothing committed. Run the callback again.
 * - `UnknownTransactionCommitResult` — the commit may already have landed. Retry the
 *   *commit*, never the callback.
 *
 * Treating the second like the first replays a committed transaction. In a bank that is a
 * customer debited twice for one payment, and it only shows up under load, which is the
 * worst combination there is. These tests pin the distinction down with a fake session so
 * it can be asserted without a replica set or a partition.
 */

/** Attaches the error labels the driver uses, since that is what the runner reads. */
function labelled(message: string, ...errorLabels: string[]): Error & { errorLabels: string[] } {
  return Object.assign(new Error(message), { errorLabels });
}

interface FakeSession {
  readonly session: ClientSession;
  readonly commits: () => number;
  readonly aborts: () => number;
}

/**
 * A session whose commit fails a set number of times before succeeding.
 *
 * @param failures Errors to throw from `commitTransaction`, in order. Once exhausted, the
 * commit succeeds.
 */
function fakeSession(failures: readonly Error[]): FakeSession {
  let commits = 0;
  let aborts = 0;
  let open = false;

  const session = {
    startTransaction: () => {
      open = true;
    },
    commitTransaction: async () => {
      const failure = failures[commits];
      commits += 1;
      if (failure) throw failure;
      open = false;
    },
    abortTransaction: async () => {
      aborts += 1;
      open = false;
    },
    endSession: async () => {
      open = false;
    },
    inTransaction: () => open,
  } as unknown as ClientSession;

  return { session, commits: () => commits, aborts: () => aborts };
}

function runnerFor(session: ClientSession): TransactionRunner {
  const connection = { startSession: async () => session } as unknown as Connection;
  return new TransactionRunner(connection);
}

describe('TransactionRunner', () => {
  it('runs the callback once and commits when nothing goes wrong', async () => {
    const fake = fakeSession([]);
    let calls = 0;

    const result = await runnerFor(fake.session).run(async () => {
      calls += 1;
      return 'done';
    });

    expect(result).toBe('done');
    expect(calls).toBe(1);
    expect(fake.commits()).toBe(1);
    expect(fake.aborts()).toBe(0);
  });

  it('replays the callback after a transient abort, because nothing was committed', async () => {
    const fake = fakeSession([labelled('write conflict', 'TransientTransactionError')]);
    let calls = 0;

    const result = await runnerFor(fake.session).run(async () => {
      calls += 1;
      return calls;
    });

    // Two runs of the callback: the first attempt aborted before committing anything.
    expect(calls).toBe(2);
    expect(result).toBe(2);
  });

  it('retries only the commit when the commit outcome is unknown', async () => {
    const fake = fakeSession([labelled('network blip', 'UnknownTransactionCommitResult')]);
    let calls = 0;

    const result = await runnerFor(fake.session).run(async () => {
      calls += 1;
      return 'posted';
    });

    // The claim this whole file exists for: the callback ran once. Had it run twice, the
    // money it moved would have moved twice.
    expect(calls).toBe(1);
    expect(fake.commits()).toBe(2);
    expect(result).toBe('posted');
  });

  it('never replays the callback, however many times the commit outcome is unknown', async () => {
    const unknown = (): Error => labelled('still unknown', 'UnknownTransactionCommitResult');
    const fake = fakeSession([unknown(), unknown(), unknown(), unknown()]);
    let calls = 0;

    await expect(
      runnerFor(fake.session).run(async () => {
        calls += 1;
      }),
    ).rejects.toThrow('still unknown');

    // Surfaced to the caller rather than replayed. A transaction whose commit may have
    // landed is not something to run again on the customer's behalf.
    expect(calls).toBe(1);
  });

  it('propagates a real error immediately, without retrying anything', async () => {
    const fake = fakeSession([]);
    let calls = 0;

    await expect(
      runnerFor(fake.session).run(async () => {
        calls += 1;
        throw new Error('the account is closed');
      }),
    ).rejects.toThrow('the account is closed');

    expect(calls).toBe(1);
    expect(fake.commits()).toBe(0);
    expect(fake.aborts()).toBe(1);
  });

  it('gives up with CONFLICT once the transient attempts are spent', async () => {
    const conflict = (): Error => labelled('write conflict', 'TransientTransactionError');
    const fake = fakeSession([conflict(), conflict(), conflict(), conflict(), conflict()]);

    await expect(
      runnerFor(fake.session).run(async () => 'never settles', { maxAttempts: 5 }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });
});
