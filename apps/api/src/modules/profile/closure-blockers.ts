/**
 * What stands between a customer and closing their relationship with the bank.
 *
 * `AccountClosureService` models this for a single account: money left behind is money the
 * bank has quietly kept, and a live hold is a promise to a third party. Closing the whole
 * relationship is the same argument applied to everything the customer holds at once, plus
 * two things a single account cannot see — a card that can still authorise, and a debt.
 *
 * Pure, and that is the point. Every blocker is `(records) → reason | nothing`, so the
 * question "why can this customer not close?" is answerable from a fixture rather than
 * from a database, and the answer is the same sentence the customer is shown.
 *
 * The list is deliberately exhaustive rather than short-circuiting. A customer told to
 * cancel a card, who then comes back and is told about a loan, and then about a balance,
 * has been made to discover the bank's rules one refusal at a time.
 */

import { AccountStatus, LoanStatus, DepositStatus, type CardStatus } from '@reliance/contracts';

import { fromStored, type StoredMoney } from '../../common/money/money.codec.js';

/** One thing in the way, phrased for the person reading it. */
export interface ClosureBlocker {
  /** Machine-readable family, so a client can group or link without parsing English. */
  readonly kind: 'BALANCE' | 'HOLD' | 'CARD' | 'LOAN' | 'DEPOSIT';
  /** What the customer has to do about it. One sentence, naming the thing. */
  readonly reason: string;
}

/** The records a closure decision is made from. Only the fields the rules actually read. */
export interface ClosureSubject {
  readonly accounts: readonly ClosableAccount[];
  readonly cards: readonly ClosableCard[];
  readonly loans: readonly ClosableLoan[];
  readonly deposits: readonly ClosableDeposit[];
}

export interface ClosableAccount {
  readonly id: string;
  readonly status: AccountStatus;
  readonly productName: string;
  readonly number: string;
  readonly ledgerBalance: StoredMoney;
  readonly holdTotal: StoredMoney;
}

export interface ClosableCard {
  readonly last4: string;
  readonly status: CardStatus;
}

export interface ClosableLoan {
  readonly id: string;
  readonly status: LoanStatus;
  readonly outstandingPrincipal: StoredMoney;
}

export interface ClosableDeposit {
  readonly status: DepositStatus;
  readonly principal: StoredMoney;
  readonly maturesOn: string;
}

/** Accounts already closed hold nothing and are not in anybody's way. */
const LIVE_ACCOUNT_STATUSES: readonly AccountStatus[] = Object.freeze([
  AccountStatus.PENDING,
  AccountStatus.ACTIVE,
  AccountStatus.FROZEN,
  AccountStatus.DORMANT,
  AccountStatus.CLOSING,
]);

/**
 * Card states that still mean something.
 *
 * A frozen or reported card blocks too. Freezing is reversible from the customer's own
 * settings screen, so a relationship closed over a frozen card would leave a card that can
 * be thawed against an account that no longer exists.
 */
const SPENT_CARD_STATUSES: readonly string[] = Object.freeze(['EXPIRED', 'CANCELLED']);

/** Loan states that still represent a debt. */
const OWED_LOAN_STATUSES: readonly LoanStatus[] = Object.freeze([
  LoanStatus.ACTIVE,
  LoanStatus.IN_ARREARS,
  LoanStatus.RESTRUCTURED,
]);

/**
 * Everything in the way, in the order a customer would deal with it.
 *
 * Money first because it is the one the customer cares about, then the things that have to
 * be ended before the money can leave.
 */
export function closureBlockers(subject: ClosureSubject): ClosureBlocker[] {
  const live = subject.accounts.filter((account) => LIVE_ACCOUNT_STATUSES.includes(account.status));

  return [
    ...live.flatMap(balanceBlocker),
    ...live.flatMap(holdBlocker),
    ...subject.deposits.flatMap(depositBlocker),
    ...subject.loans.flatMap(loanBlocker),
    ...subject.cards.flatMap(cardBlocker),
  ];
}

/**
 * Money still in an account.
 *
 * Both directions block, and for opposite reasons. A credit balance is the customer's
 * money and closing over it is the bank keeping it; a debit balance is the bank's money and
 * closing over it is writing the debt off. Neither is ours to do quietly.
 */
function balanceBlocker(account: ClosableAccount): ClosureBlocker[] {
  const balance = fromStored(account.ledgerBalance);
  if (balance.isZero) return [];

  const remedy = balance.isNegative
    ? `Repay the ${balance.abs().format()} outstanding on it`
    : `Move the ${balance.format()} in it to another bank`;

  return [{ kind: 'BALANCE', reason: `${remedy}, then we can close your ${describe(account)}.` }];
}

/** Funds promised to somebody else. Same reasoning as the single-account closure guard. */
function holdBlocker(account: ClosableAccount): ClosureBlocker[] {
  const held = fromStored(account.holdTotal);
  if (held.isZero) return [];

  return [
    {
      kind: 'HOLD',
      reason:
        `${held.format()} on your ${describe(account)} is set aside for a payment that has ` +
        'not finished. Wait for it to complete or fall away, then try again.',
    },
  ];
}

/** A card that could still authorise against an account we are about to close. */
function cardBlocker(card: ClosableCard): ClosureBlocker[] {
  if (SPENT_CARD_STATUSES.includes(card.status)) return [];

  return [
    {
      kind: 'CARD',
      reason: `Cancel your card ending ${card.last4} — it can still be used until you do.`,
    },
  ];
}

/** A debt. The bank does not forgive one by closing the file that records it. */
function loanBlocker(loan: ClosableLoan): ClosureBlocker[] {
  if (!OWED_LOAN_STATUSES.includes(loan.status)) return [];

  const owed = fromStored(loan.outstandingPrincipal);
  return [
    {
      kind: 'LOAN',
      reason: `Settle your loan ${loan.id} — ${owed.format()} of it is still outstanding.`,
    },
  ];
}

/** Money the bank is holding to a term. It is the customer's, and it is not in an account. */
function depositBlocker(deposit: ClosableDeposit): ClosureBlocker[] {
  if (deposit.status !== DepositStatus.ACTIVE) return [];

  const principal = fromStored(deposit.principal);
  return [
    {
      kind: 'DEPOSIT',
      reason:
        `Your ${principal.format()} fixed-term savings mature on ${deposit.maturesOn}. ` +
        'Wait for that date or close them early, then try again.',
    },
  ];
}

/** How many digits of an account number a customer is shown. Never the whole thing. */
const VISIBLE_DIGITS = -4;

/** "Everyday Current Account ending 4471" — how a customer recognises which one we mean. */
function describe(account: ClosableAccount): string {
  return `${account.productName} ending ${account.number.slice(VISIBLE_DIGITS)}`;
}
