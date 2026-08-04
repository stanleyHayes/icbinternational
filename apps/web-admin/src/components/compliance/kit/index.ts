/**
 * Shared furniture for the customer, compliance and support workstations.
 *
 * These three trees are one lane: an analyst opens a monitoring alert, jumps to the
 * customer it belongs to, reads their identity case and ends up in a ticket, and the SLA
 * clock, the status colours and the reason codes must mean the same thing at every stop.
 * Keeping them in one module is what makes that true by construction rather than by care.
 *
 * ```ts
 * import { ConsoleScreen, SlaCell, useConsoleNow } from '@/components/compliance/kit';
 * ```
 */

export { DocumentViewer, type DocumentViewerProps, type ViewableDocument } from './document-viewer';
export { KYC_TIER_OPTIONS, MAX_KYC_TIER } from './kyc-tiers';
export { MatchScore, scoreBand, scoreBandLabel, type MatchScoreProps } from './match-score';
export { NoteThread, type CaseNote, type NoteThreadProps } from './note-thread';
export { openColumn, type OpenColumnOptions } from './open-column';
export {
  CONSOLE_KEY,
  QUEUE_PAGE_SIZE,
  QUEUE_STALE_TIME_MS,
  queueQueryOptions,
} from './query-config';
export {
  failureMessage,
  QueueError,
  QueueLoading,
  type QueueErrorProps,
  type QueueLoadingProps,
} from './query-states';
export {
  findReason,
  KYC_MORE_INFO_REASONS,
  KYC_REJECTION_REASONS,
  reasonOptions,
  SCREENING_DISPOSITION_REASONS,
  type ReasonCode,
} from './reason-codes';
export {
  ReasonedDecisionForm,
  type ReasonedDecision,
  type ReasonedDecisionFormProps,
} from './reasoned-decision';
export {
  ConsoleScreen,
  MetricRow,
  MetricTile,
  ScreenPanel,
  type ConsoleScreenProps,
  type MetricTileProps,
  type ScreenPanelProps,
} from './screen';
export { SlaCell, slaText, type SlaCellProps } from './sla';
export { countBreached, hasBreached, slaSortValue } from './sla-order';
export {
  alertTone,
  caseTone,
  customerTone,
  disputeTone,
  kycTone,
  priorityTone,
  riskTone,
  screeningTone,
  severityTone,
  ticketTone,
  type CaseStatus,
  type ScreeningStatus,
} from './tones';
export { useConsoleNow } from './use-now';
export { useSelection, type Selection } from './use-selection';
