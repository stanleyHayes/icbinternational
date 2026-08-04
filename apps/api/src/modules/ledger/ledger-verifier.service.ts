import { Injectable, Logger } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStoredOrZero } from '../../common/money/money.codec.js';

import { VERIFIER_BATCH_SIZE } from './ledger.constants.js';
import { AccountBalancePort } from './ports/account-balance.port.js';
import { JournalEntryStore } from './repositories/journal-entry.store.js';
import { LedgerAccountStore } from './repositories/ledger-account.store.js';
import {
  controlTotalsFromReplay,
  diffBalance,
  trialBalanceFromReplay,
} from './verification/drift.js';
import { LedgerReplay } from './verification/ledger-replay.js';
import {
  DriftScope,
  type BalanceDrift,
  type LedgerVerificationReport,
  type ReplayedBalance,
} from './verification/verification.types.js';

/**
 * Proof that the ledger has not drifted — the check `pnpm ledger:verify` runs.
 *
 * Balances are a cache. Every cache eventually disagrees with the thing it caches, and
 * for a bank the interesting question is not whether that will happen but how long it
 * takes to notice. This service answers it directly: replay every posting from zero and
 * diff the result against every stored balance.
 *
 * It reads without a session on purpose. Wrapping a full-book replay in a snapshot
 * transaction would hold a read lock for the length of the scan and would exceed the
 * server's transaction lifetime on any realistic book. The consequence is that an entry
 * posted mid-scan can appear in the replay while its balance update does not, or the
 * reverse — so a report is a signal to investigate, not a verdict, and a genuine drift
 * reproduces on a second run while a race does not.
 */
@Injectable()
export class LedgerVerifierService {
  private readonly logger = new Logger(LedgerVerifierService.name);

  constructor(
    private readonly entries: JournalEntryStore,
    private readonly ledgerAccounts: LedgerAccountStore,
    private readonly balances: AccountBalancePort,
    private readonly clock: ClockService,
  ) {}

  /** Rebuilds every balance from postings and reports what disagrees. */
  async verify(): Promise<LedgerVerificationReport> {
    const replay = await this.replayEveryEntry();

    const ledgerBalances = replay.ledgerBalances();
    const customerBalances = replay.customerBalances();

    const report: LedgerVerificationReport = {
      asOf: this.clock.now().toISOString(),
      entriesScanned: replay.entriesScanned,
      healthy: false,
      unbalancedEntries: replay.unbalancedEntries,
      ledgerAccountDrift: await this.diffLedgerAccounts(ledgerBalances),
      customerAccountDrift: await this.diffCustomerAccounts(customerBalances),
      trialBalance: trialBalanceFromReplay(ledgerBalances),
      controlTotals: controlTotalsFromReplay({ ledgerBalances, customerBalances }),
    };

    return this.conclude(report);
  }

  /**
   * Streams the whole collection in id order, folding each batch into the replay.
   *
   * Batched rather than loaded whole because "the ledger fits in memory" is true right up
   * to the day it is not, and that day arrives without warning during an incident.
   */
  private async replayEveryEntry(): Promise<LedgerReplay> {
    const replay = new LedgerReplay();
    let afterId: string | undefined;

    for (;;) {
      const batch = await this.entries.scanFrom({ afterId, limit: VERIFIER_BATCH_SIZE });
      if (batch.length === 0) return replay;

      for (const record of batch) replay.add(record);

      afterId = batch.at(-1)?.id;
      if (batch.length < VERIFIER_BATCH_SIZE) return replay;
    }
  }

  private async diffLedgerAccounts(replayed: readonly ReplayedBalance[]): Promise<BalanceDrift[]> {
    const drift: BalanceDrift[] = [];
    const replayedKeys = new Set(
      replayed.map((balance) => balanceKey(balance.target, balance.currency)),
    );

    for (const balance of replayed) {
      const account = await this.ledgerAccounts.findByCode(balance.target);
      const stored = account
        ? fromStoredOrZero(account.balances[balance.currency], balance.balance.currency)
        : null;

      const finding = diffBalance({ scope: DriftScope.LEDGER_ACCOUNT, replayed: balance, stored });
      if (finding) drift.push(finding);
    }

    return drift.concat(await this.diffUnpostedLedgerBalances(replayedKeys));
  }

  /**
   * The mirror image of the replay diff: a stored GL balance that no posting produced.
   *
   * Checking only what the replay saw would miss a projection that was written *around*
   * the ledger — a manual `$set`, a buggy migration — because nothing replays to it. Any
   * stored balance without postings must be zero; anything else is drift with no expected
   * side at all.
   */
  private async diffUnpostedLedgerBalances(
    replayedKeys: ReadonlySet<string>,
  ): Promise<BalanceDrift[]> {
    const drift: BalanceDrift[] = [];

    for (const account of await this.ledgerAccounts.listAll()) {
      for (const [currency, stored] of Object.entries(account.balances)) {
        if (replayedKeys.has(balanceKey(account.code, currency))) continue;

        const amount = fromStoredOrZero(stored, balanceCurrency(currency));
        if (amount.isZero) continue;

        drift.push({
          scope: DriftScope.LEDGER_ACCOUNT,
          target: account.code,
          currency,
          expected: ZERO_MINOR_UNITS,
          actual: amount.amount.toString(),
          difference: amount.amount.toString(),
        });
      }
    }

    return drift;
  }

  /**
   * Diffs customer balances through the port.
   *
   * Only accounts that have been posted to are reachable this way — the ledger cannot
   * enumerate a collection it does not own. An account holding a balance it never earned
   * is caught instead by the control-total check, which compares the sum of customer
   * deposits against GL 2000 and cannot be fooled by an account the replay never saw.
   */
  private async diffCustomerAccounts(
    replayed: readonly ReplayedBalance[],
  ): Promise<BalanceDrift[]> {
    const drift: BalanceDrift[] = [];

    for (const balance of replayed) {
      const stored = await this.balances.currentBalance(balance.target);
      const finding = diffBalance({
        scope: DriftScope.CUSTOMER_ACCOUNT,
        replayed: balance,
        stored,
      });
      if (finding) drift.push(finding);
    }

    return drift;
  }

  /** Decides the verdict and says so loudly enough to page someone. */
  private conclude(report: LedgerVerificationReport): LedgerVerificationReport {
    const healthy =
      report.unbalancedEntries.length === 0 &&
      report.ledgerAccountDrift.length === 0 &&
      report.customerAccountDrift.length === 0 &&
      report.trialBalance.every((line) => line.balanced) &&
      report.controlTotals.every((line) => line.matched);

    if (healthy) {
      this.logger.log(`Ledger verified: ${report.entriesScanned} entries, no drift`);
    } else {
      this.logger.error(
        `LEDGER DRIFT DETECTED after ${report.entriesScanned} entries — ` +
          `${report.unbalancedEntries.length} unbalanced, ` +
          `${report.ledgerAccountDrift.length} GL, ` +
          `${report.customerAccountDrift.length} customer`,
      );
    }

    return { ...report, healthy };
  }
}

const ZERO_MINOR_UNITS = '0';
const KEY_SEPARATOR = '|';

function balanceKey(target: string, currency: string): string {
  return `${target}${KEY_SEPARATOR}${currency}`;
}

/**
 * Every currency reaching this service came out of a `Money`, so it is already a valid
 * ISO code. The cast re-tells the compiler what the runtime already guarantees.
 */
function balanceCurrency(currency: string): Parameters<typeof fromStoredOrZero>[1] {
  return currency as Parameters<typeof fromStoredOrZero>[1];
}
