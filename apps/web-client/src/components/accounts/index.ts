/**
 * The account screens.
 *
 * **Every component in this directory is a client component.** `@reliance/ui` ships no
 * `'use client'` markers of its own, so anything that touches it declares the boundary itself.
 */

export { AccountDetail, type AccountDetailProps } from './account-detail';
export { AccountIdentity, type AccountIdentityProps } from './account-identity';
export { AccountList, type AccountListProps } from './account-list';
export { AccountTile, accountName, type AccountTileProps } from './account-tile';
export { BalancePanel, type BalancePanelProps } from './balance-panel';
export { CloseAccountForm, type CloseAccountFormProps } from './close-account-form';
export { CopyValue, type CopyValueProps } from './copy-value';
export {
  ACCOUNT_STATUS_EXPLANATION,
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  ACCOUNT_TYPE_LABEL,
  formatIban,
  formatRateBps,
  formatSortCode,
  isOpen,
  isOperable,
} from './labels';
export { NicknameForm, type NicknameFormProps } from './nickname-form';
export { OpenAccountForm } from './open-account-form';
export { ProductChoice, type ProductChoiceProps } from './product-choice';
export {
  accountRoute,
  accountsRoute,
  closeAccountRoute,
  openAccountRoute,
  statementsRoute,
} from './routes';
export { StatementArchive, type StatementArchiveProps } from './statement-archive';
export {
  useAccount,
  useAccounts,
  useCloseAccount,
  useNetWorth,
  useOpenAccount,
  useProducts,
  useRequestStatement,
  useStatements,
  useUpdateAccount,
} from './use-accounts';
