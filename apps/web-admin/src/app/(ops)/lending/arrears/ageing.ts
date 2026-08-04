/**
 * Ageing buckets, and what each one means operationally.
 *
 * The boundaries are not arbitrary. Thirty days is when a missed payment stops being an
 * administrative slip and starts being a collections case; ninety is the impairment
 * trigger the bank reports against; a hundred and eighty is where recovery gives way to
 * write-off. Naming them here rather than scattering the numbers across the screen keeps
 * the dashboard and the book agreeing about what "in arrears" means.
 */

import type { Loan } from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

import { sumAmounts } from '@/components/ops';

/** One ageing band. */
export interface AgeingBucket {
  readonly id: string;
  readonly label: string;
  /** What the bank does about accounts in this band. */
  readonly action: string;
  readonly tone: Tone;
  /** Inclusive lower bound in days past due. */
  readonly fromDays: number;
  /** Exclusive upper bound, or `null` for the final band. */
  readonly toDays: number | null;
}

/** The bands, earliest first. */
export const AGEING_BUCKETS: readonly AgeingBucket[] = [
  {
    id: 'current',
    label: '1 to 29 days',
    action: 'Reminder by message and email. No collections contact yet.',
    tone: 'pending',
    fromDays: 1,
    toDays: 30,
  },
  {
    id: 'thirty',
    label: '30 to 89 days',
    action: 'Collections contact and an affordability conversation.',
    tone: 'warning',
    fromDays: 30,
    toDays: 90,
  },
  {
    id: 'ninety',
    label: '90 to 179 days',
    action: 'Impaired. Formal arrears notice and a payment arrangement.',
    tone: 'danger',
    fromDays: 90,
    toDays: 180,
  },
  {
    id: 'recovery',
    label: '180 days and over',
    action: 'Recovery. Write-off considered under dual control.',
    tone: 'debit',
    fromDays: 180,
    toDays: null,
  },
];

/** True when a loan falls in this band. */
export function inBucket(loan: Loan, bucket: AgeingBucket): boolean {
  const days = loan.daysPastDue;
  return days >= bucket.fromDays && (bucket.toDays === null || days < bucket.toDays);
}

/** The loans in each band, with the value at risk in it. */
export interface BucketSummary extends AgeingBucket {
  readonly count: number;
  /** Total arrears in the band, in minor units. */
  readonly arrears: string;
}

/** Splits a book of arrears into its ageing bands. */
export function summariseAgeing(loans: readonly Loan[]): readonly BucketSummary[] {
  return AGEING_BUCKETS.map((bucket) => {
    const inBand = loans.filter((loan) => inBucket(loan, bucket));
    return {
      ...bucket,
      count: inBand.length,
      arrears: sumAmounts(inBand.map((loan) => loan.arrearsAmount)),
    };
  });
}
