/**
 * The movement lane's shared component library.
 *
 * Everything the money-movement and product screens have in common — transfers, payees, standing
 * orders, bills, cards, saving, borrowing, wallets, settings, support — is exported from here, so
 * a screen imports from `@/components/transfers` and never reaches into a file inside it.
 *
 * **Every module in this directory is a client component or a browser hook.** `@reliance/ui` ships
 * no `'use client'` markers of its own, so anything touching it declares the boundary itself. The
 * one exception is `kit/screen-guard.ts`, which is `server-only` and is imported by path rather
 * than through this barrel — pulling it in here would drag `next/headers` into the browser bundle.
 *
 * The directory is named for transfers because ownership of this workstream is drawn around
 * `components/transfers/**`; see `docs/HANDOFFS.md` for the note asking for it to be renamed to
 * `components/kit/**` once the boundaries relax.
 */

export {
  describeDestination,
  EMPTY_DRAFT,
  toDestination,
  TransferKind,
  type DestinationDraft,
} from './destination/destination-draft';
export { destinationErrors, type DestinationErrors } from './destination/destination-errors';
export {
  DomesticFields,
  InternationalFields,
  OwnAccountFields,
  RelianceFields,
  type DestinationFieldsProps,
  type OwnAccountFieldsProps,
} from './destination/destination-fields';
export { draftFromPayee } from './destination/draft-from-payee';
export { KindPicker, type KindPickerProps } from './destination/kind-picker';

export {
  ConfirmAction,
  stepUpOptions,
  type ConfirmActionProps,
  type ConfirmedAction,
} from './kit/confirm-action';
export { CopyButton, type CopyButtonProps } from './kit/copy-button';
export { DetailList, type Detail, type DetailListProps } from './kit/detail-list';
export { QueryPanel, type QueryPanelProps } from './kit/query-panel';
export { MoneyCell, type MoneyCellOptions, type MoneyCellProps } from './kit/money-cell';
export { movementKeys, type QueryFilters } from './kit/query-keys';
export { laneRoutes } from './kit/routes';
export { SearchField, type SearchFieldProps } from './kit/search-field';
export { Section, SubSection, type SectionProps, type SubSectionProps } from './kit/section';
export {
  BILL_STATUS,
  CANCELLABLE_TRANSFER,
  MANDATE_STATUS,
  ORDER_STATUS,
  RAIL_LOOK,
  REQUEST_STATUS,
  TRANSFER_STATUS,
  type StatusLook,
} from './kit/status-labels';
export { SubNav, type SubNavItem, type SubNavProps } from './kit/sub-nav';

export { AccountSelect, type AccountSelectProps } from './money/account-select';
export { AmountField, overBalanceMessage, type AmountFieldProps } from './money/amount-field';
export {
  NameCheckNotice,
  needsAcknowledgement,
  useNameCheck,
  type NameCheckInput,
  type NameCheckNoticeProps,
} from './money/name-check';
export { QuoteTimer, type QuoteTimerProps } from './money/quote-timer';
export {
  accountLabel,
  accountOptions,
  currencyOf,
  resolveAccount,
  useAccounts,
  useUsableAccounts,
} from './money/use-accounts';
export {
  countdownLabel,
  QUOTE_URGENT_SECONDS,
  useQuoteExpiry,
  type QuoteExpiry,
  type QuoteTiming,
} from './money/use-quote-expiry';
