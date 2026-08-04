import { type ClientSession } from 'mongoose';

import { type CreateDepositRequest } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import {
  frozenClock,
  ledgerRigFor,
  type LedgerRig,
} from '../../accounts/__tests__/accounts-harness.js';
import { AccountService, InMemoryAccountStore } from '../../accounts/index.js';
import { BalanceService } from '../../holds/index.js';
import { DepositMaturityService } from '../deposit-maturity.service.js';
import { DepositService } from '../deposit.service.js';
import { InMemoryDepositStore } from '../in-memory-deposit.store.js';

/**
 * The deposits lane wired end to end over in-memory stores.
 *
 * Everything below the runner is real: the rate board, the interest arithmetic, the
 * availability calculation, the posting service, the chart of accounts and the
 * double-entry invariant. Placing a deposit in these tests books a genuine balanced
 * journal entry and moves a real account projection.
 */
export interface DepositsRig {
  accounts: InMemoryAccountStore;
  deposits: InMemoryDepositStore;
  balances: BalanceService;
  service: DepositService;
  maturity: DepositMaturityService;
  ledger: LedgerRig;
  clock: ClockService;
  runner: TransactionRunner;
}

/** Wires the lane. */
export function depositsRig(): DepositsRig {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();
  const deposits = new InMemoryDepositStore(new IdGenerator());
  const runner = rollbackRunner(deposits);

  const ledger = ledgerRigFor(accounts, clock, runner);
  const balances = new BalanceService(accounts, clock);
  const accountService = new AccountService(accounts, clock, runner);

  return {
    accounts,
    deposits,
    balances,
    ledger,
    clock,
    runner,
    service: new DepositService(deposits, accountService, balances, ledger.postings, clock, runner),
    maturity: new DepositMaturityService(deposits, ledger.postings, clock, runner),
  };
}

/**
 * A `TransactionRunner` that runs inline and **undoes the deposit store on failure**.
 *
 * The undo is the point. `retryingRunner` in the accounts harness reproduces the retry
 * contract but not the rollback, and without a rollback there is no observable difference
 * between "the record and the posting were written in one transaction" and "the record was
 * written, then the posting failed" — which is exactly the defect these tests exist to
 * catch. Snapshotting before each attempt and restoring after a failure is what MongoDB
 * does on abort, reproduced as closely as an in-memory store allows.
 *
 * Only the deposit store is restored. The account and journal projections are the ledger
 * lane's to roll back, and a test that needed them undone would be testing that lane.
 */
export function rollbackRunner(store: InMemoryDepositStore, maxAttempts = 5): TransactionRunner {
  const run = async <T>(work: (session: ClientSession) => Promise<T>): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const before = store.snapshot();
      try {
        return await work({} as ClientSession);
      } catch (error) {
        store.restore(before);
        if (!isTransient(error)) throw error;
        lastError = error;
      }
    }

    throw lastError;
  };

  return {
    run,
    runIn: <T>(outer: ClientSession | undefined, work: (active: ClientSession) => Promise<T>) =>
      outer ? work(outer) : run(work),
  } as unknown as TransactionRunner;
}

function isTransient(error: unknown): boolean {
  const labels: unknown = (error as { errorLabels?: unknown }).errorLabels;
  return Array.isArray(labels) && labels.includes('TransientTransactionError');
}

/** The smallest placement the board accepts, so a fixture is never refused on size. */
export const MINIMUM_PLACEMENT = Money.fromMinor('100000', 'GBP');

/** A placement request over a tenor that is on the board. */
export function placementRequest(
  sourceAccountId: string,
  overrides: Partial<CreateDepositRequest> = {},
): CreateDepositRequest {
  return {
    sourceAccountId,
    amount: MINIMUM_PLACEMENT.toJSON(),
    termMonths: 12,
    autoRollover: false,
    ...overrides,
  };
}
