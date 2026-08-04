/**
 * What colour a state is, decided once for the whole console.
 *
 * Two screens that tint "Reversed" differently teach an operator that the tint means
 * nothing, and from then on they read only the word — which is slower and is exactly what
 * the colour was meant to save them. Every mapping is total, so a new contract enum member
 * is a compile error here rather than an untinted cell in production.
 *
 * Colour is never the only signal anywhere it is used: each of these sits behind a
 * `StatusPill` or a `Badge`, both of which spell the state out in words.
 */

import {
  AlertSeverity,
  ApprovalStatus,
  CardStatus,
  HoldStatus,
  JournalEntryStatus,
  LoanApplicationStatus,
  LoanStatus,
  PublishStatus,
  TransactionStatus,
} from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

/** How a background job run is progressing. */
export type JobRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING' | 'DEAD';

/** Where a campaign has got to. */
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED';

const TRANSACTION: Readonly<Record<TransactionStatus, Tone>> = {
  [TransactionStatus.PENDING]: 'pending',
  [TransactionStatus.COMPLETED]: 'success',
  [TransactionStatus.FAILED]: 'danger',
  [TransactionStatus.REVERSED]: 'neutral',
  [TransactionStatus.DISPUTED]: 'warning',
};

const ENTRY: Readonly<Record<JournalEntryStatus, Tone>> = {
  [JournalEntryStatus.PENDING]: 'pending',
  [JournalEntryStatus.POSTED]: 'success',
  [JournalEntryStatus.REVERSED]: 'neutral',
};

const HOLD: Readonly<Record<HoldStatus, Tone>> = {
  [HoldStatus.ACTIVE]: 'pending',
  [HoldStatus.CAPTURED]: 'success',
  [HoldStatus.RELEASED]: 'neutral',
  [HoldStatus.EXPIRED]: 'neutral',
};

const APPROVAL: Readonly<Record<ApprovalStatus, Tone>> = {
  [ApprovalStatus.PENDING]: 'pending',
  [ApprovalStatus.APPROVED]: 'success',
  [ApprovalStatus.REJECTED]: 'danger',
  [ApprovalStatus.EXPIRED]: 'neutral',
};

const SEVERITY: Readonly<Record<AlertSeverity, Tone>> = {
  [AlertSeverity.LOW]: 'neutral',
  [AlertSeverity.MEDIUM]: 'info',
  [AlertSeverity.HIGH]: 'warning',
  [AlertSeverity.CRITICAL]: 'danger',
};

const CARD: Readonly<Record<CardStatus, Tone>> = {
  [CardStatus.ORDERED]: 'neutral',
  [CardStatus.PRINTING]: 'neutral',
  [CardStatus.SHIPPED]: 'info',
  [CardStatus.DELIVERED]: 'info',
  [CardStatus.INACTIVE]: 'pending',
  [CardStatus.ACTIVE]: 'success',
  [CardStatus.FROZEN]: 'warning',
  [CardStatus.LOST]: 'danger',
  [CardStatus.STOLEN]: 'danger',
  [CardStatus.EXPIRED]: 'neutral',
  [CardStatus.CANCELLED]: 'neutral',
};

const APPLICATION: Readonly<Record<LoanApplicationStatus, Tone>> = {
  [LoanApplicationStatus.DRAFT]: 'neutral',
  [LoanApplicationStatus.SUBMITTED]: 'info',
  [LoanApplicationStatus.UNDER_REVIEW]: 'pending',
  [LoanApplicationStatus.REFERRED]: 'warning',
  [LoanApplicationStatus.APPROVED]: 'success',
  [LoanApplicationStatus.DECLINED]: 'danger',
  [LoanApplicationStatus.OFFER_MADE]: 'accent',
  [LoanApplicationStatus.OFFER_ACCEPTED]: 'success',
  [LoanApplicationStatus.OFFER_EXPIRED]: 'neutral',
  [LoanApplicationStatus.WITHDRAWN]: 'neutral',
  [LoanApplicationStatus.DISBURSED]: 'credit',
};

const LOAN: Readonly<Record<LoanStatus, Tone>> = {
  [LoanStatus.ACTIVE]: 'success',
  [LoanStatus.IN_ARREARS]: 'danger',
  [LoanStatus.SETTLED]: 'neutral',
  [LoanStatus.WRITTEN_OFF]: 'debit',
  [LoanStatus.RESTRUCTURED]: 'warning',
};

const PUBLISH: Readonly<Record<PublishStatus, Tone>> = {
  [PublishStatus.DRAFT]: 'neutral',
  [PublishStatus.IN_REVIEW]: 'pending',
  [PublishStatus.SCHEDULED]: 'info',
  [PublishStatus.PUBLISHED]: 'success',
  [PublishStatus.ARCHIVED]: 'neutral',
};

const JOB: Readonly<Record<JobRunStatus, Tone>> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
  RETRYING: 'pending',
  DEAD: 'debit',
};

const CAMPAIGN: Readonly<Record<CampaignStatus, Tone>> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  SENDING: 'pending',
  SENT: 'success',
  CANCELLED: 'neutral',
  FAILED: 'danger',
};

/** Tone for a customer-facing transaction's status. */
export const toneForTransaction = (status: TransactionStatus): Tone => TRANSACTION[status];
/** Tone for a journal entry's status. */
export const toneForEntry = (status: JournalEntryStatus): Tone => ENTRY[status];
/** Tone for a hold's status. */
export const toneForHold = (status: HoldStatus): Tone => HOLD[status];
/** Tone for a dual-control request's status. */
export const toneForApproval = (status: ApprovalStatus): Tone => APPROVAL[status];
/** Tone for an alert or case severity. */
export const toneForSeverity = (severity: AlertSeverity): Tone => SEVERITY[severity];
/** Tone for a card's lifecycle status. */
export const toneForCard = (status: CardStatus): Tone => CARD[status];
/** Tone for a lending application's status. */
export const toneForApplication = (status: LoanApplicationStatus): Tone => APPLICATION[status];
/** Tone for a live loan's status. */
export const toneForLoan = (status: LoanStatus): Tone => LOAN[status];
/** Tone for a content item's publish state. */
export const toneForPublish = (status: PublishStatus): Tone => PUBLISH[status];
/** Tone for a background job run. */
export const toneForJob = (status: JobRunStatus): Tone => JOB[status];
/** Tone for a campaign send. */
export const toneForCampaign = (status: CampaignStatus): Tone => CAMPAIGN[status];
