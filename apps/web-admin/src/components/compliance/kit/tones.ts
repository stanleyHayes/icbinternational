/**
 * What each state looks like, decided once.
 *
 * Nine queues in this lane show a status pill, and if each screen picked its own colour
 * an analyst moving between them would have to relearn the palette every time. Worse,
 * colour is never the whole signal: every pill built from these maps also carries the
 * state in words, so an operator who cannot distinguish amber from red still reads
 * "Overdue".
 *
 * Anything not named here is neutral. A new contract state therefore appears as a plain
 * grey pill with its own label rather than silently borrowing the meaning of another.
 */

import {
  AlertSeverity,
  AlertStatus,
  DisputeStatus,
  KycStatus,
  RiskRating,
  TicketPriority,
  TicketStatus,
  UserStatus,
} from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

/** A screening hit's adjudication state, as the provisional contract declares it. */
export type ScreeningStatus = 'OPEN' | 'TRUE_MATCH' | 'FALSE_POSITIVE' | 'ESCALATED';

/** An investigation case's state. */
export type CaseStatus = 'OPEN' | 'INVESTIGATING' | 'AWAITING_APPROVAL' | 'CLOSED' | 'REPORTED';

const NEUTRAL: Tone = 'neutral';

const KYC_TONE: Partial<Record<KycStatus, Tone>> = {
  [KycStatus.APPROVED]: 'success',
  [KycStatus.REJECTED]: 'danger',
  [KycStatus.EXPIRED]: 'danger',
  [KycStatus.MORE_INFO_REQUIRED]: 'warning',
  [KycStatus.UNDER_REVIEW]: 'info',
  [KycStatus.SUBMITTED]: 'pending',
  [KycStatus.IN_PROGRESS]: 'pending',
};

const SEVERITY_TONE: Record<AlertSeverity, Tone> = {
  [AlertSeverity.CRITICAL]: 'danger',
  [AlertSeverity.HIGH]: 'danger',
  [AlertSeverity.MEDIUM]: 'warning',
  [AlertSeverity.LOW]: 'info',
};

const ALERT_TONE: Record<AlertStatus, Tone> = {
  [AlertStatus.OPEN]: 'pending',
  [AlertStatus.TRIAGED]: 'info',
  [AlertStatus.ESCALATED]: 'danger',
  [AlertStatus.CLOSED_FALSE_POSITIVE]: 'neutral',
  [AlertStatus.CLOSED_ACTIONED]: 'success',
};

const SCREENING_TONE: Record<ScreeningStatus, Tone> = {
  OPEN: 'pending',
  TRUE_MATCH: 'danger',
  FALSE_POSITIVE: 'neutral',
  ESCALATED: 'warning',
};

const CASE_TONE: Record<CaseStatus, Tone> = {
  OPEN: 'pending',
  INVESTIGATING: 'info',
  AWAITING_APPROVAL: 'warning',
  CLOSED: 'neutral',
  REPORTED: 'danger',
};

const DISPUTE_TONE: Record<DisputeStatus, Tone> = {
  [DisputeStatus.SUBMITTED]: 'pending',
  [DisputeStatus.UNDER_REVIEW]: 'info',
  [DisputeStatus.EVIDENCE_REQUESTED]: 'warning',
  [DisputeStatus.REPRESENTED]: 'info',
  [DisputeStatus.ARBITRATION]: 'warning',
  [DisputeStatus.WON]: 'success',
  [DisputeStatus.LOST]: 'danger',
  [DisputeStatus.WITHDRAWN]: 'neutral',
};

const TICKET_TONE: Record<TicketStatus, Tone> = {
  [TicketStatus.OPEN]: 'pending',
  [TicketStatus.AWAITING_CUSTOMER]: 'info',
  [TicketStatus.AWAITING_AGENT]: 'warning',
  [TicketStatus.ESCALATED]: 'danger',
  [TicketStatus.RESOLVED]: 'success',
  [TicketStatus.CLOSED]: 'neutral',
};

const PRIORITY_TONE: Record<TicketPriority, Tone> = {
  [TicketPriority.URGENT]: 'danger',
  [TicketPriority.HIGH]: 'warning',
  [TicketPriority.NORMAL]: 'info',
  [TicketPriority.LOW]: 'neutral',
};

const CUSTOMER_TONE: Record<UserStatus, Tone> = {
  [UserStatus.ACTIVE]: 'success',
  [UserStatus.SUSPENDED]: 'danger',
  [UserStatus.LOCKED]: 'warning',
  [UserStatus.CLOSED]: 'neutral',
  [UserStatus.PENDING_VERIFICATION]: 'pending',
};

const RISK_TONE: Record<RiskRating, Tone> = {
  [RiskRating.LOW]: 'success',
  [RiskRating.MEDIUM]: 'warning',
  [RiskRating.HIGH]: 'danger',
  [RiskRating.PROHIBITED]: 'danger',
};

/** Tone for an identity-verification state. */
export const kycTone = (status: KycStatus): Tone => KYC_TONE[status] ?? NEUTRAL;
/** Tone for an alert or case severity. */
export const severityTone = (severity: AlertSeverity): Tone => SEVERITY_TONE[severity];
/** Tone for a monitoring alert's state. */
export const alertTone = (status: AlertStatus): Tone => ALERT_TONE[status];
/** Tone for a screening hit's adjudication. */
export const screeningTone = (status: ScreeningStatus): Tone => SCREENING_TONE[status];
/** Tone for an investigation case's state. */
export const caseTone = (status: CaseStatus): Tone => CASE_TONE[status];
/** Tone for a dispute's state. */
export const disputeTone = (status: DisputeStatus): Tone => DISPUTE_TONE[status];
/** Tone for a support ticket's state. */
export const ticketTone = (status: TicketStatus): Tone => TICKET_TONE[status];
/** Tone for a support ticket's priority. */
export const priorityTone = (priority: TicketPriority): Tone => PRIORITY_TONE[priority];
/** Tone for a customer's account state. */
export const customerTone = (status: UserStatus): Tone => CUSTOMER_TONE[status] ?? NEUTRAL;
/** Tone for a customer-risk rating. */
export const riskTone = (rating: RiskRating): Tone => RISK_TONE[rating];
