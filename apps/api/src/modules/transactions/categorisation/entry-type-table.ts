import { EntryType, SpendCategory } from '@reliance/contracts';

/**
 * What each kind of ledger entry means to a customer when no merchant code is available.
 *
 * Most movement in a bank is not card spend and carries no MCC: a standing order, an
 * interest credit, a fee. The entry type is the only signal, and it is a good one — the
 * ledger already had to decide what the movement *was* in order to choose the accounts to
 * post it against.
 *
 * `UNCATEGORISED` is used deliberately and only where guessing would be worse than
 * admitting ignorance. A manual adjustment or a dispute credit has no honest category,
 * and filing it under one would corrupt every spend total that includes it.
 */
export const CATEGORY_BY_ENTRY_TYPE: Readonly<Record<EntryType, SpendCategory>> = {
  [EntryType.ACCOUNT_OPENING]: SpendCategory.TRANSFERS,
  [EntryType.INTERNAL_TRANSFER]: SpendCategory.TRANSFERS,
  [EntryType.DOMESTIC_TRANSFER]: SpendCategory.TRANSFERS,
  [EntryType.INTERNATIONAL_TRANSFER]: SpendCategory.TRANSFERS,
  [EntryType.INBOUND_TRANSFER]: SpendCategory.INCOME,
  [EntryType.CARD_PURCHASE]: SpendCategory.SHOPPING,
  [EntryType.CARD_REFUND]: SpendCategory.SHOPPING,
  [EntryType.ATM_WITHDRAWAL]: SpendCategory.CASH,
  [EntryType.BILL_PAYMENT]: SpendCategory.UTILITIES,
  [EntryType.DIRECT_DEBIT]: SpendCategory.SUBSCRIPTIONS,
  [EntryType.FEE]: SpendCategory.FEES,
  [EntryType.FEE_WAIVER]: SpendCategory.FEES,
  [EntryType.INTEREST_CREDIT]: SpendCategory.INCOME,
  [EntryType.INTEREST_DEBIT]: SpendCategory.FEES,
  [EntryType.FX_CONVERSION]: SpendCategory.TRANSFERS,
  [EntryType.LOAN_DISBURSEMENT]: SpendCategory.INCOME,
  [EntryType.LOAN_REPAYMENT]: SpendCategory.TRANSFERS,
  [EntryType.DEPOSIT_PLACEMENT]: SpendCategory.SAVINGS,
  [EntryType.DEPOSIT_MATURITY]: SpendCategory.SAVINGS,
  [EntryType.GOAL_CONTRIBUTION]: SpendCategory.SAVINGS,
  [EntryType.ROUND_UP]: SpendCategory.SAVINGS,
  [EntryType.MANUAL_ADJUSTMENT]: SpendCategory.UNCATEGORISED,
  [EntryType.REVERSAL]: SpendCategory.UNCATEGORISED,
  [EntryType.DISPUTE_PROVISIONAL_CREDIT]: SpendCategory.UNCATEGORISED,
  [EntryType.DISPUTE_RESOLUTION]: SpendCategory.UNCATEGORISED,
  [EntryType.WRITE_OFF]: SpendCategory.UNCATEGORISED,
};

/**
 * Entry types whose category must not be overridden by a merchant code.
 *
 * A card refund carries the original purchase's MCC, and a fee charged by a merchant
 * acquirer can carry theirs. Letting the MCC win would file a £3 non-sterling fee under
 * "Dining" because the meal that triggered it was at a restaurant, and the customer's
 * fees total would silently under-report.
 */
export const ENTRY_TYPES_IGNORING_MCC: ReadonlySet<EntryType> = new Set([
  EntryType.FEE,
  EntryType.FEE_WAIVER,
  EntryType.INTEREST_CREDIT,
  EntryType.INTEREST_DEBIT,
  EntryType.REVERSAL,
  EntryType.DISPUTE_PROVISIONAL_CREDIT,
  EntryType.DISPUTE_RESOLUTION,
  EntryType.WRITE_OFF,
]);
