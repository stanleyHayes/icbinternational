/**
 * The bank's batch processing, named the way the operations runbook names it.
 *
 * Every one of these is a real end-of-period process a bank runs on a schedule: interest
 * accrues nightly, settlement batches go out against the rails' cut-offs, statements are
 * generated at the cycle date. The console can run one on demand — because a batch that
 * failed at two in the morning has to be re-run by somebody at nine — and the presets are
 * the sequences the runbook prescribes, in the order it prescribes them.
 *
 * Order matters and is not cosmetic. Holds must expire before settlement, or value that
 * has already been released is settled twice; interest accrues after settlement, or the
 * day's movements are not in the balance it accrues on.
 */

import { SimJob } from '@reliance/contracts';

/** One batch process the operations desk can run. */
export interface BatchJob {
  readonly job: SimJob;
  readonly label: string;
  /** What it does to the book, in one sentence. */
  readonly effect: string;
}

/** Every batch process, described. */
export const BATCH_JOBS: readonly BatchJob[] = [
  {
    job: SimJob.EXPIRE_HOLDS,
    label: 'Hold expiry',
    effect:
      'Releases authorisations the merchant never captured, returning the value to available balances.',
  },
  {
    job: SimJob.SETTLE_CARD_BATCH,
    label: 'Card settlement',
    effect: 'Converts captured authorisations into postings and settles with the schemes.',
  },
  {
    job: SimJob.SETTLE_TRANSFER_BATCH,
    label: 'Transfer settlement',
    effect: 'Presents queued outbound transfers to the clearing rails against their cut-off.',
  },
  {
    job: SimJob.RUN_STANDING_ORDERS,
    label: 'Standing orders',
    effect: 'Executes every standing order and scheduled transfer due today.',
  },
  {
    job: SimJob.ACCRUE_INTEREST,
    label: 'Interest accrual',
    effect: 'Accrues one day of credit and debit interest on every eligible balance.',
  },
  {
    job: SimJob.CAPITALISE_INTEREST,
    label: 'Interest capitalisation',
    effect: 'Posts accrued interest to customer accounts, so it starts earning in its own right.',
  },
  {
    job: SimJob.CHARGE_MONTHLY_FEES,
    label: 'Monthly fees',
    effect: 'Charges account maintenance fees, applying each product version’s free allowances.',
  },
  {
    job: SimJob.GENERATE_STATEMENTS,
    label: 'Statement generation',
    effect: 'Produces statements for every account reaching its cycle date.',
  },
  {
    job: SimJob.MATURE_DEPOSITS,
    label: 'Deposit maturity',
    effect: 'Matures term deposits falling due, paying interest or rolling them over.',
  },
  {
    job: SimJob.ASSESS_ARREARS,
    label: 'Arrears assessment',
    effect: 'Re-ages every loan behind schedule and moves accounts between collections bands.',
  },
  {
    job: SimJob.RESCREEN_CUSTOMERS,
    label: 'Customer rescreening',
    effect: 'Re-runs sanctions and politically-exposed-person screening across the customer base.',
  },
];

/** A named sequence from the operations runbook. */
export interface BatchPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** The jobs, in the order the runbook requires them. */
  readonly jobs: readonly SimJob[];
}

/** The sequences the desk runs as a unit. */
export const BATCH_PRESETS: readonly BatchPreset[] = [
  {
    id: 'start-of-day',
    label: 'Start of day',
    description: 'Standing orders and screening, before the branches open.',
    jobs: [SimJob.RUN_STANDING_ORDERS, SimJob.RESCREEN_CUSTOMERS],
  },
  {
    id: 'end-of-day',
    label: 'End of day',
    description:
      'The nightly close: release stale holds, settle both rails, then accrue interest and re-age arrears.',
    jobs: [
      SimJob.EXPIRE_HOLDS,
      SimJob.SETTLE_CARD_BATCH,
      SimJob.SETTLE_TRANSFER_BATCH,
      SimJob.ACCRUE_INTEREST,
      SimJob.ASSESS_ARREARS,
    ],
  },
  {
    id: 'end-of-month',
    label: 'End of month',
    description: 'Capitalise interest, charge fees, mature deposits and issue statements.',
    jobs: [
      SimJob.CAPITALISE_INTEREST,
      SimJob.CHARGE_MONTHLY_FEES,
      SimJob.MATURE_DEPOSITS,
      SimJob.GENERATE_STATEMENTS,
    ],
  },
];

/** The batch process's operational name. */
export function batchLabel(job: SimJob): string {
  return BATCH_JOBS.find((candidate) => candidate.job === job)?.label ?? job;
}
