/**
 * The words the bank uses for the codes on the wire.
 *
 * `RENT_MORTGAGE` is a database value; "Rent and mortgage" is what a person reads. Keeping the
 * translation in one table means a category is spelled the same on the statement, in the donut's
 * legend, in the filter menu and in the exported CSV — and that a new category added to the
 * contract shows up as a compile error here rather than as `UNCATEGORISED` on somebody's screen.
 */

import {
  EntryType,
  SpendCategory,
  TransactionDirection,
  TransactionStatus,
} from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

/** Category names, in the bank's voice. */
export const CATEGORY_LABEL: Readonly<Record<SpendCategory, string>> = {
  [SpendCategory.GROCERIES]: 'Groceries',
  [SpendCategory.DINING]: 'Eating out',
  [SpendCategory.TRANSPORT]: 'Transport',
  [SpendCategory.FUEL]: 'Fuel',
  [SpendCategory.SHOPPING]: 'Shopping',
  [SpendCategory.ENTERTAINMENT]: 'Entertainment',
  [SpendCategory.SUBSCRIPTIONS]: 'Subscriptions',
  [SpendCategory.UTILITIES]: 'Bills and utilities',
  [SpendCategory.RENT_MORTGAGE]: 'Rent and mortgage',
  [SpendCategory.HEALTH]: 'Health',
  [SpendCategory.EDUCATION]: 'Education',
  [SpendCategory.TRAVEL]: 'Travel',
  [SpendCategory.INSURANCE]: 'Insurance',
  [SpendCategory.TRANSFERS]: 'Transfers',
  [SpendCategory.CASH]: 'Cash',
  [SpendCategory.FEES]: 'Fees and charges',
  [SpendCategory.INCOME]: 'Income',
  [SpendCategory.SAVINGS]: 'Savings',
  [SpendCategory.UNCATEGORISED]: 'Not yet categorised',
};

/** Every category, in the order the filter menu and the legend list them. */
export const CATEGORY_ORDER: readonly SpendCategory[] = Object.values(SpendCategory);

/** What a movement is called on a statement. */
export const ENTRY_TYPE_LABEL: Readonly<Record<EntryType, string>> = {
  [EntryType.ACCOUNT_OPENING]: 'Account opening',
  [EntryType.INTERNAL_TRANSFER]: 'Transfer between your accounts',
  [EntryType.DOMESTIC_TRANSFER]: 'Bank transfer',
  [EntryType.INTERNATIONAL_TRANSFER]: 'International transfer',
  [EntryType.INBOUND_TRANSFER]: 'Money received',
  [EntryType.CARD_PURCHASE]: 'Card payment',
  [EntryType.CARD_REFUND]: 'Card refund',
  [EntryType.ATM_WITHDRAWAL]: 'Cash withdrawal',
  [EntryType.BILL_PAYMENT]: 'Bill payment',
  [EntryType.DIRECT_DEBIT]: 'Direct Debit',
  [EntryType.FEE]: 'Fee',
  [EntryType.FEE_WAIVER]: 'Fee refunded',
  [EntryType.INTEREST_CREDIT]: 'Interest paid to you',
  [EntryType.INTEREST_DEBIT]: 'Interest charged',
  [EntryType.FX_CONVERSION]: 'Currency exchange',
  [EntryType.LOAN_DISBURSEMENT]: 'Loan paid out',
  [EntryType.LOAN_REPAYMENT]: 'Loan repayment',
  [EntryType.DEPOSIT_PLACEMENT]: 'Fixed deposit opened',
  [EntryType.DEPOSIT_MATURITY]: 'Fixed deposit matured',
  [EntryType.GOAL_CONTRIBUTION]: 'Added to a savings goal',
  [EntryType.ROUND_UP]: 'Round-up to savings',
  [EntryType.MANUAL_ADJUSTMENT]: 'Adjustment',
  [EntryType.REVERSAL]: 'Reversal',
  [EntryType.DISPUTE_PROVISIONAL_CREDIT]: 'Temporary refund while we investigate',
  [EntryType.DISPUTE_RESOLUTION]: 'Dispute resolved',
  [EntryType.WRITE_OFF]: 'Written off',
};

/** How a transaction's state is described, and the tone it carries. */
export const STATUS_LABEL: Readonly<Record<TransactionStatus, string>> = {
  [TransactionStatus.PENDING]: 'Pending',
  [TransactionStatus.COMPLETED]: 'Completed',
  [TransactionStatus.FAILED]: 'Failed',
  [TransactionStatus.REVERSED]: 'Reversed',
  [TransactionStatus.DISPUTED]: 'Disputed',
};

/** Tones for the status pill. Colour is a scanning aid; {@link STATUS_LABEL} is the message. */
export const STATUS_TONE: Readonly<Record<TransactionStatus, Tone>> = {
  [TransactionStatus.PENDING]: 'pending',
  [TransactionStatus.COMPLETED]: 'success',
  [TransactionStatus.FAILED]: 'danger',
  [TransactionStatus.REVERSED]: 'neutral',
  [TransactionStatus.DISPUTED]: 'warning',
};

/**
 * The narrower tone set `TransactionRow` accepts.
 *
 * The design system deliberately limits a row's status to three tones — a list of forty rows in
 * nine colours is a list nobody can scan. Disputed reads as pending gold rather than red: the
 * money is provisionally back and the outcome is not yet decided, and red would say otherwise.
 */
export const ROW_STATUS_TONE: Readonly<
  Record<TransactionStatus, 'pending' | 'danger' | 'neutral'>
> = {
  [TransactionStatus.PENDING]: 'pending',
  [TransactionStatus.COMPLETED]: 'neutral',
  [TransactionStatus.FAILED]: 'danger',
  [TransactionStatus.REVERSED]: 'neutral',
  [TransactionStatus.DISPUTED]: 'pending',
};

/** Money in and money out, as a customer would say it. */
export const DIRECTION_LABEL: Readonly<Record<TransactionDirection, string>> = {
  [TransactionDirection.DEBIT]: 'Money out',
  [TransactionDirection.CREDIT]: 'Money in',
};

/** Statuses in the order the filters offer them: the ones people look for first. */
export const STATUS_ORDER: readonly TransactionStatus[] = [
  TransactionStatus.COMPLETED,
  TransactionStatus.PENDING,
  TransactionStatus.DISPUTED,
  TransactionStatus.FAILED,
  TransactionStatus.REVERSED,
];
