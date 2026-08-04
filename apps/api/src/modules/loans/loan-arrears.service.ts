/**
 * Arrears: detecting missed payments and booking what they cost.
 *
 * Driven entirely by the business date, so advancing the simulated clock by a month
 * produces a month of missed instalments, late fees, bucket movements and provisioning —
 * which is the whole point of having a clock the operator can move.
 *
 * The sweep is idempotent twice over: `lastArrearsRunOn` stops a loan being processed
 * twice on the same date, and a late fee is recognised on the instalment row itself, so an
 * instalment can never attract a second one however many times it is visited.
 */

import { Injectable, Logger } from '@nestjs/common';

import { Money } from '@reliance/money';

import { fromStored, toStored } from '../../common/money/money.codec.js';

import {
  arrearsAmount,
  bucketForDays,
  daysPastDue,
  isLateFeeCharged,
  overdueInstalments,
  requiredProvision,
} from './arrears.js';
import { LoanLedgerService } from './loan-ledger.service.js';
import { LATE_FEE_MINOR_UNITS } from './loan.constants.js';
import { LoanStore, type LoanRecord, type ScheduleRowRecord } from './loan.store.js';
import { DpdBucket, LoanStatus, type ArrearsPosition } from './loan.types.js';

/** How many loans one sweep pass will look at. Keeps a run bounded and observable. */
const SWEEP_BATCH_SIZE = 500;

@Injectable()
export class LoanArrearsService {
  private readonly logger = new Logger(LoanArrearsService.name);

  constructor(
    private readonly loans: LoanStore,
    private readonly ledger: LoanLedgerService,
  ) {}

  /**
   * Runs the arrears sweep for the current business date.
   *
   * @returns How many loans were assessed, which is what the job's metrics record.
   */
  async sweep(): Promise<number> {
    const asOf = this.ledger.today();
    const due = await this.loans.listForArrearsSweep({ asOf, limit: SWEEP_BATCH_SIZE });

    for (const loan of due) {
      await this.assess(loan, asOf);
    }

    return due.length;
  }

  /**
   * Assesses one loan: charge fees for newly missed instalments, then reprovision.
   *
   * In that order, because the late fee is part of what is overdue and therefore part of
   * the exposure the allowance is calculated on.
   */
  async assess(loan: LoanRecord, asOf: string): Promise<ArrearsPosition> {
    const schedule = await this.chargeLateFees(loan, asOf);
    const position = positionOf({ ...loan, schedule }, asOf);
    const allowanceMovement = position.requiredProvision.minus(fromStored(loan.provisionHeld));

    await this.ledger.moveAllowance({
      loanId: loan.id,
      description: `Impairment allowance — ${position.bucket}`,
      discriminator: asOf,
      increase: allowanceMovement,
    });

    await this.loans.patch(loan.id, {
      schedule,
      provisionHeld: toStored(position.requiredProvision),
      status: statusFor(loan, position),
      lastArrearsRunOn: asOf,
    });

    return position;
  }

  /**
   * Charges one late fee per newly missed instalment.
   *
   * Recorded on the instalment row, not on a counter: the row is what the arrears
   * calculation reads, and a fee that lived anywhere else could drift away from the
   * instalment it belongs to.
   */
  private async chargeLateFees(
    loan: LoanRecord,
    asOf: string,
  ): Promise<readonly ScheduleRowRecord[]> {
    const currency = fromStored(loan.principal).currency;
    const fee = Money.fromMinor(LATE_FEE_MINOR_UNITS, currency);
    const overdue = overdueInstalments(loan.schedule, asOf);
    const chargeable = overdue.filter((row) => !isLateFeeCharged(row));

    for (const row of chargeable) {
      await this.ledger.chargeLateFee({
        loanId: loan.id,
        description: `Late payment fee — instalment ${row.instalment}`,
        discriminator: String(row.instalment),
        amount: fee,
      });
      this.logger.log(`Late fee charged on loan ${loan.id} instalment ${row.instalment}`);
    }

    const charged = new Set(chargeable.map((row) => row.instalment));
    const late = new Set(overdue.map((row) => row.instalment));

    return loan.schedule.map((row) => {
      if (!late.has(row.instalment)) return row;
      const fees = charged.has(row.instalment)
        ? fromStored(row.fees).plus(fee)
        : fromStored(row.fees);
      return { ...row, fees: toStored(fees), status: 'OVERDUE' as const };
    });
  }

  /** The collections queue, worst first. */
  async listArrears(bucket?: DpdBucket): Promise<ArrearsPosition[]> {
    const asOf = this.ledger.today();
    const inArrears = await this.loans.list({ status: LoanStatus.IN_ARREARS });

    return inArrears
      .map((loan) => positionOf(loan, asOf))
      .filter((position) => (bucket ? position.bucket === bucket : true))
      .sort((left, right) => right.daysPastDue - left.daysPastDue);
  }
}

/**
 * A loan's arrears position on a date.
 *
 * Exported and pure so the admin list, the customer's own view and the sweep all read the
 * same numbers — three places that would otherwise each derive "how far behind is this"
 * slightly differently.
 */
export function positionOf(loan: LoanRecord, asOf: string): ArrearsPosition {
  const currency = fromStored(loan.principal).currency;
  const days = daysPastDue(loan.schedule, asOf);
  const bucket = bucketForDays(days);

  return {
    loanId: loan.id,
    userId: loan.userId,
    daysPastDue: days,
    bucket,
    arrearsAmount: arrearsAmount(loan.schedule, asOf, currency),
    missedInstalments: overdueInstalments(loan.schedule, asOf).length,
    requiredProvision: requiredProvision(fromStored(loan.outstandingPrincipal), bucket),
  };
}

/**
 * The status a loan should carry given its arrears.
 *
 * A restructured loan that falls behind again goes to `IN_ARREARS` like any other: the
 * arrangement was the bank's last concession, and hiding a broken arrangement inside the
 * status that granted it is how a forbearance book stops being readable.
 */
function statusFor(loan: LoanRecord, position: ArrearsPosition): LoanStatus {
  if (loan.status === LoanStatus.SETTLED || loan.status === LoanStatus.WRITTEN_OFF) {
    return loan.status;
  }
  return position.missedInstalments > 0 ? LoanStatus.IN_ARREARS : LoanStatus.ACTIVE;
}
