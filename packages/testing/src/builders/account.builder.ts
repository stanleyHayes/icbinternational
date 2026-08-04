/**
 * Fluent builder for the contract `Account`.
 *
 * Defaults describe an active GBP current account at a plausible balance. Banking
 * identifiers (account number, sort code, IBAN) are fixed valid test values, not
 * random digits — a scrambled IBAN in a failure message helps no one.
 */

import { AccountStatus, AccountType, accountSchema, type Account } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { aBalance } from './balance.builder.js';
import { Builder, DEFAULT_INSTANT } from './builder.js';
import { testId } from './test-id.js';

/** Recognisably-fake but schema-valid banking identifiers. */
const DEFAULT_ACCOUNT_NUMBER = '0123456789';
const DEFAULT_SORT_CODE = '049921';
const DEFAULT_IBAN = 'GB29RLNC0499210123456789';
const DEFAULT_PRODUCT_CODE = 'CURRENT_EVERYDAY';
const DEFAULT_PRODUCT_NAME = 'Everyday Current Account';
/** Advertised rate on the default savings product, in basis points. */
const SAVINGS_INTEREST_BPS = 150;

/** Builds contract-valid {@link Account} objects. */
export class AccountBuilder extends Builder<Account> {
  private idOverride: string | null = null;
  private userId = testId('usr');
  private type: AccountType = AccountType.CURRENT;
  private status: AccountStatus = AccountStatus.ACTIVE;
  private currency: CurrencyCode = 'GBP';
  private nickname: string | null = null;
  private balance = aBalance().build();

  withId(id: string): this {
    this.idOverride = id;
    return this;
  }

  withUserId(userId: string): this {
    this.userId = userId;
    return this;
  }

  withType(type: AccountType): this {
    this.type = type;
    return this;
  }

  withStatus(status: AccountStatus): this {
    this.status = status;
    return this;
  }

  withCurrency(currency: CurrencyCode): this {
    this.currency = currency;
    return this;
  }

  withNickname(nickname: string | null): this {
    this.nickname = nickname;
    return this;
  }

  /** Replaces the whole balance projection, e.g. `aBalance().withLedger(0n).build()`. */
  withBalance(balance: Account['balance']): this {
    this.balance = balance;
    return this;
  }

  build(): Account {
    return accountSchema.parse({
      id: this.idOverride ?? testId('acc'),
      userId: this.userId,
      type: this.type,
      status: this.status,
      currency: this.currency,
      productCode: DEFAULT_PRODUCT_CODE,
      productName: DEFAULT_PRODUCT_NAME,
      nickname: this.nickname,
      number: DEFAULT_ACCOUNT_NUMBER,
      sortCode: DEFAULT_SORT_CODE,
      iban: DEFAULT_IBAN,
      balance: this.balance,
      holderIds: [this.userId],
      interestRateBps: this.type === AccountType.SAVINGS ? SAVINGS_INTEREST_BPS : null,
      isPrimary: true,
      openedAt: DEFAULT_INSTANT,
      closedAt: this.status === AccountStatus.CLOSED ? DEFAULT_INSTANT : null,
    });
  }
}

/** Entry point: `anAccount().withStatus(AccountStatus.FROZEN).build()`. */
export function anAccount(): AccountBuilder {
  return new AccountBuilder();
}
