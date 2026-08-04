import { LedgerAccountType } from '@reliance/contracts';

/**
 * The bank's chart of accounts.
 *
 * Every movement of value in Reliance Bank lands on two of these. Customer balances are
 * not free-floating numbers — they roll up into `CUSTOMER_DEPOSITS`, and the sum of every
 * customer's balance must equal that control account exactly. When it doesn't, something
 * has bypassed the ledger, and the nightly verifier says so.
 */

export interface ChartEntry {
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  /**
   * Control accounts aggregate many customer-facing accounts and may only be posted to
   * as the automatic counterparty of a customer posting, never directly by an operator.
   */
  readonly isControlAccount: boolean;
}

export const GL = {
  CASH_AT_CENTRAL_BANK: '1000',
  NOSTRO_CLEARING: '1050',
  CARD_NETWORK_SETTLEMENT: '1100',
  LOANS_RECEIVABLE: '1200',
  /**
   * Contra-asset. Carries a credit balance that nets against loans receivable, so the
   * balance sheet shows what the book is expected to be worth rather than its face value.
   * Typed ASSET because that is the side it offsets; a negative balance here is correct.
   */
  LOAN_LOSS_ALLOWANCE: '1290',
  ACCRUED_INTEREST_RECEIVABLE: '1250',
  FEES_RECEIVABLE: '1300',

  CUSTOMER_DEPOSITS: '2000',
  UNSETTLED_INBOUND: '2100',
  UNSETTLED_OUTBOUND: '2150',
  HOLDS_AND_LIENS: '2200',
  TERM_DEPOSITS: '2300',
  /**
   * Money a customer has ring-fenced into a savings goal or vault.
   *
   * Still owed to them, so still a liability — but not on demand in the same sense as a
   * current-account balance, and emphatically not a hold. Parking it in Holds and Liens
   * (as it was before this account existed) made every vault look like a lien on the
   * balance sheet, which is a different thing entirely to a regulator and to a customer.
   */
  SAVINGS_VAULTS: '2400',
  ACCRUED_INTEREST_PAYABLE: '2350',
  SUSPENSE: '2900',

  RETAINED_EARNINGS: '3000',

  FEE_INCOME: '4000',
  INTEREST_INCOME: '4100',
  FX_SPREAD_INCOME: '4200',
  PENALTY_INCOME: '4300',

  INTEREST_EXPENSE: '5000',
  LOAN_LOSS_PROVISION: '5100',
  DISPUTE_LOSSES: '5200',
  FEE_WAIVERS: '5300',
} as const;

export type GlCode = (typeof GL)[keyof typeof GL];

export const CHART_OF_ACCOUNTS: readonly ChartEntry[] = Object.freeze([
  entry(GL.CASH_AT_CENTRAL_BANK, 'Cash at Central Bank', LedgerAccountType.ASSET),
  entry(GL.NOSTRO_CLEARING, 'Nostro / External Clearing', LedgerAccountType.ASSET),
  entry(GL.CARD_NETWORK_SETTLEMENT, 'Card Network Settlement', LedgerAccountType.ASSET),
  entry(GL.LOANS_RECEIVABLE, 'Loans Receivable', LedgerAccountType.ASSET, true),
  entry(GL.LOAN_LOSS_ALLOWANCE, 'Loan Loss Allowance', LedgerAccountType.ASSET),
  entry(GL.ACCRUED_INTEREST_RECEIVABLE, 'Accrued Interest Receivable', LedgerAccountType.ASSET),
  entry(GL.FEES_RECEIVABLE, 'Fees Receivable', LedgerAccountType.ASSET),

  entry(GL.CUSTOMER_DEPOSITS, 'Customer Deposits', LedgerAccountType.LIABILITY, true),
  entry(GL.UNSETTLED_INBOUND, 'Unsettled Inbound Payments', LedgerAccountType.LIABILITY),
  entry(GL.UNSETTLED_OUTBOUND, 'Unsettled Outbound Payments', LedgerAccountType.LIABILITY),
  entry(GL.HOLDS_AND_LIENS, 'Holds and Liens', LedgerAccountType.LIABILITY),
  entry(GL.TERM_DEPOSITS, 'Term Deposits', LedgerAccountType.LIABILITY, true),
  entry(GL.SAVINGS_VAULTS, 'Savings Vaults', LedgerAccountType.LIABILITY, true),
  entry(GL.ACCRUED_INTEREST_PAYABLE, 'Accrued Interest Payable', LedgerAccountType.LIABILITY),
  entry(GL.SUSPENSE, 'Suspense', LedgerAccountType.LIABILITY),

  entry(GL.RETAINED_EARNINGS, 'Retained Earnings', LedgerAccountType.EQUITY),

  entry(GL.FEE_INCOME, 'Fee Income', LedgerAccountType.INCOME),
  entry(GL.INTEREST_INCOME, 'Interest Income', LedgerAccountType.INCOME),
  entry(GL.FX_SPREAD_INCOME, 'FX Spread Income', LedgerAccountType.INCOME),
  entry(GL.PENALTY_INCOME, 'Penalty Income', LedgerAccountType.INCOME),

  entry(GL.INTEREST_EXPENSE, 'Interest Expense', LedgerAccountType.EXPENSE),
  entry(GL.LOAN_LOSS_PROVISION, 'Loan Loss Provision', LedgerAccountType.EXPENSE),
  entry(GL.DISPUTE_LOSSES, 'Dispute Losses', LedgerAccountType.EXPENSE),
  entry(GL.FEE_WAIVERS, 'Fee Waivers', LedgerAccountType.EXPENSE),
]);

const BY_CODE = new Map(CHART_OF_ACCOUNTS.map((account) => [account.code, account]));

export function findGlAccount(code: string): ChartEntry | undefined {
  return BY_CODE.get(code);
}

/**
 * Whether a debit increases this account type.
 *
 * Assets and expenses grow on the debit side; liabilities, equity and income grow on the
 * credit side. Every balance projection in the system derives its sign from this one
 * function, so there is exactly one place to be wrong — and it is covered by tests.
 */
export function debitIncreases(type: LedgerAccountType): boolean {
  return type === LedgerAccountType.ASSET || type === LedgerAccountType.EXPENSE;
}

function entry(
  code: string,
  name: string,
  type: LedgerAccountType,
  isControlAccount = false,
): ChartEntry {
  return Object.freeze({ code, name, type, isControlAccount });
}
