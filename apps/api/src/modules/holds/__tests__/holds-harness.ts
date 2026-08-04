import { type ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import {
  frozenClock,
  ledgerRigFor,
  retryingRunner,
  type LedgerRig,
} from '../../accounts/__tests__/accounts-harness.js';
import { InMemoryAccountStore } from '../../accounts/index.js';
import { BalanceService } from '../balance.service.js';
import { HoldCaptureService } from '../hold-capture.service.js';
import { HoldService } from '../hold.service.js';
import { InMemoryHoldStore } from '../in-memory-hold.store.js';

/**
 * The holds lane wired end to end over in-memory stores.
 *
 * Everything below the fakes is real: the availability arithmetic, the optimistic-
 * concurrency contract, the posting service and the chart of accounts. A capture in these
 * tests books a genuine balanced journal entry, which is the only way to be sure the
 * capture path books one at all.
 */
export interface HoldsRig {
  accounts: InMemoryAccountStore;
  holdStore: InMemoryHoldStore;
  balances: BalanceService;
  holds: HoldService;
  capture: HoldCaptureService;
  ledger: LedgerRig;
  clock: ClockService;
  runner: TransactionRunner;
}

export function holdsRig(): HoldsRig {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();
  const runner = retryingRunner();
  const ledger = ledgerRigFor(accounts, clock, runner);

  const balances = new BalanceService(accounts, clock);
  const holdStore = new InMemoryHoldStore(new IdGenerator());
  const holds = new HoldService(holdStore, balances, clock, runner);

  return {
    accounts,
    holdStore,
    balances,
    holds,
    capture: new HoldCaptureService(holds, ledger.postings, clock, runner),
    ledger,
    clock,
    runner,
  };
}
