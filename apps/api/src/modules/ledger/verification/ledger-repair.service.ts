import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { Money, type CurrencyCode } from '@reliance/money';

import { TransactionRunner } from '../../../database/transaction.runner.js';
import { LedgerVerifierService } from '../ledger-verifier.service.js';
import { LEDGER_TRANSACTION_LABEL } from '../ledger.constants.js';
import { AccountBalancePort } from '../ports/account-balance.port.js';
import { LedgerAccountStore } from '../repositories/ledger-account.store.js';

import {
  DriftScope,
  type BalanceDrift,
  type LedgerVerificationReport,
} from './verification.types.js';

/**
 * Closes the loop the verifier opens: put the projections back where the postings say
 * they belong.
 *
 * A correction is applied as a delta through the same stores `PostingService` writes
 * through — never as a direct `$set` — so there is exactly one code path capable of
 * moving a balance, and this is it, run by hand, after a human has read the drift report.
 * The command then verifies a second time: the proof that the repair worked is a clean
 * report, not the absence of an exception.
 *
 * Drift on a customer account the balance port does not know cannot be repaired from
 * here — the accounts module owns that record — and is reported rather than guessed at.
 */
@Injectable()
export class LedgerRepairService {
  private readonly logger = new Logger(LedgerRepairService.name);

  constructor(
    private readonly verifier: LedgerVerifierService,
    private readonly ledgerAccounts: LedgerAccountStore,
    private readonly balances: AccountBalancePort,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Verifies, repairs any drift inside one transaction, and verifies again.
   *
   * @returns The post-repair report. Its `healthy` flag is the verdict the command
   *   exits on — a repair that did not take still fails the run.
   */
  async verifyAndRepair(): Promise<LedgerVerificationReport> {
    const before = await this.verifier.verify();
    if (before.healthy) return before;

    const outcome = await this.runner.run((session) => this.applyCorrections(before, session), {
      label: LEDGER_TRANSACTION_LABEL.REPAIR,
    });

    this.logger.warn(
      `Applied ${outcome.applied} balance corrections from postings ` +
        `(${outcome.skipped} skipped — owned by the accounts module). Re-verifying.`,
    );

    return this.verifier.verify();
  }

  private async applyCorrections(
    report: LedgerVerificationReport,
    session: ClientSession,
  ): Promise<RepairOutcome> {
    let applied = 0;
    let skipped = 0;

    for (const drift of [...report.ledgerAccountDrift, ...report.customerAccountDrift]) {
      const corrected = await this.correct(drift, session);
      if (corrected) applied += 1;
      else skipped += 1;
    }

    return { applied, skipped };
  }

  /** Applies `expected − actual` to one drifted balance. False when the drift is not ours. */
  private async correct(drift: BalanceDrift, session: ClientSession): Promise<boolean> {
    if (drift.actual === null && drift.scope === DriftScope.CUSTOMER_ACCOUNT) {
      this.logger.error(`Cannot repair ${drift.target}: unknown to the account balance port.`);
      return false;
    }

    const delta = correctionOf(drift);

    if (drift.scope === DriftScope.LEDGER_ACCOUNT) {
      await this.ledgerAccounts.applyEffect({ code: drift.target, delta, session });
    } else {
      await this.balances.applyDelta({ accountId: drift.target, delta, session });
    }

    return true;
  }
}

interface RepairOutcome {
  readonly applied: number;
  readonly skipped: number;
}

/** The signed movement that returns a drifted balance to what the postings demand. */
function correctionOf(drift: BalanceDrift): Money {
  const currency = drift.currency as CurrencyCode;
  const expected = Money.fromMinor(drift.expected, currency);
  const actual =
    drift.actual === null ? Money.zero(currency) : Money.fromMinor(drift.actual, currency);
  return expected.minus(actual);
}
