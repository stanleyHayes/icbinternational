/**
 * The pieces every operations, finance and administration screen is built from.
 *
 * These sit on top of `@/components/shell/ops`, which the console shell owns. That layer
 * provides the generic queue machinery — tables, drawers, decision panels. This one adds
 * what the operational screens in particular keep needing: a screen frame, headline
 * tiles, the shared colour vocabulary for a state, and the arithmetic that keeps a total
 * in `bigint`.
 */

export { ActionLink, type ActionLinkProps } from './action-link';
export { AsyncState, QueryState, type AsyncStateProps, type RetryableQuery } from './async-state';
export { DialogActions, type DialogActionsProps } from './dialog-actions';
export { blockedReasonFor, isInitiator } from './dual-control';
export { KpiTile, type KpiTileProps } from './kpi-tile';
export {
  absoluteMinor,
  compareMinor,
  isPositiveMinor,
  isZeroMinor,
  negateMinor,
  subtractMinor,
  sumAmounts,
  sumMinor,
  zeroIn,
} from './minor-units';
export { ManualPostingDialog, type ManualPostingDialogProps } from './manual-posting-dialog';
export { PostingFields, type PostingFieldsProps } from './manual-posting-fields';
export {
  DEFAULT_CURRENCY,
  draftErrors,
  emptyDraft,
  isDraftValid,
  toRequest,
  type PostingDraft,
} from './manual-posting-form';
export { Panel, type PanelProps } from './panel';
export { opsKeys } from './query-keys';
export { RegisterPanel, type RegisterPanelProps } from './register-panel';
export {
  railDescription,
  railLabel,
  railStatus,
  type RailName,
  type RailStatus,
} from './rail-health';
export { ReasonDialog, type ReasonDialogProps } from './reason-dialog';
export { OpsColumns, OpsGrid, OpsScreen, type OpsScreenProps } from './screen';
export {
  toneForApplication,
  toneForApproval,
  toneForCampaign,
  toneForCard,
  toneForEntry,
  toneForHold,
  toneForJob,
  toneForLoan,
  toneForPublish,
  toneForSeverity,
  toneForTransaction,
  type CampaignStatus,
  type JobRunStatus,
} from './status-tone';
export { TableHead, type TableHeadProps, type TableHeading } from './table-head';
export { useEventStream, type FeedTransport } from './use-event-stream';
export { useNowMs } from './use-now';
export { useSelection, type Selection } from './use-selection';
