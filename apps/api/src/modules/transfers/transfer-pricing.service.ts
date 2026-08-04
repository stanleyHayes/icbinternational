import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  ErrorCode,
  TransferRail,
  type FeeKind,
  type Money as WireMoney,
  type TransferDestination,
} from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromWire } from '../../common/money/money.codec.js';
import { AccountService, assertAccountUsable, type AccountRecord } from '../accounts/index.js';
import { PayeeResolverService, type ResolvedPayee } from '../beneficiaries/index.js';
import {
  FeeService,
  ProductService,
  matrixFor,
  type FeeQuote,
  type LimitQuery,
} from '../products/index.js';

import { feeKindFor, limitScopeFor, railFor } from './transfer-rules.js';

/**
 * The checks and lookups that pricing and execution must perform identically.
 *
 * They live in one service rather than being written twice because the failure mode of
 * writing them twice is specific and expensive: the quote says a payment is fine and the
 * execution refuses it, or — far worse — the quote refuses and a retry path that skipped a
 * check lets it through. Both paths call the same methods, so they cannot disagree.
 *
 * Nothing here writes. Everything is safe to run inside a caller's transaction or outside
 * one, which is exactly what lets the execution path re-run all of it under a session.
 */
@Injectable()
export class TransferPricingService {
  constructor(
    private readonly accounts: AccountService,
    private readonly payees: PayeeResolverService,
    private readonly products: ProductService,
    private readonly fees: FeeService,
  ) {}

  /**
   * The rail a destination travels on, refusing the ones this lane does not carry.
   *
   * Domestic and international payments are real work — batch windows, return codes,
   * correspondent charges, IBAN validation — owned by D-03 and D-04. Accepting them here
   * and booking an internal-shaped entry would produce a payment that looks settled and
   * never left the building, which is worse than a clear refusal.
   */
  assertSupportedRail(destination: TransferDestination): TransferRail {
    const rail = railFor(destination);
    if (rail === TransferRail.INTERNAL) return rail;

    throw new AppError({
      code: ErrorCode.FEATURE_DISABLED,
      message: 'Payments outside Reliance are not available yet.',
      context: { rail },
    });
  }

  /** The sender's account, owned by them and able to move money. */
  async requireSource(input: {
    userId: string;
    accountId: string;
    session?: ClientSession;
  }): Promise<AccountRecord> {
    const account = await this.accounts.requireOwned(
      { userId: input.userId, accountId: input.accountId },
      input.session,
    );
    assertAccountUsable(account);
    return account;
  }

  /**
   * The requested amount, in the source account's currency.
   *
   * A cross-currency internal transfer is refused rather than converted. Converting would
   * mean inventing a rate, and a rate the customer was never shown is a rate they never
   * agreed to. The FX path (C-03) prices the conversion explicitly and books
   * `entries.fxConversion`; this rail moves one currency between two accounts.
   */
  requireAmount(wire: WireMoney, source: AccountRecord): Money {
    const amount = fromWire(wire);

    if (!amount.isPositive) {
      throw new AppError({
        code: ErrorCode.INVALID_AMOUNT,
        message: 'A transfer must be for a positive amount.',
        context: { amount: amount.toJSON() },
      });
    }

    if (amount.currency !== (source.currency as CurrencyCode)) {
      throw new AppError({
        code: ErrorCode.CURRENCY_MISMATCH,
        message: `This account holds ${source.currency}. Converting currencies is a separate step.`,
        context: { accountCurrency: source.currency, requested: amount.currency },
      });
    }

    return amount;
  }

  /**
   * The payee's account, refusing the two destinations that cannot receive this payment.
   *
   * Paying yourself is `SAME_ACCOUNT_TRANSFER` rather than a no-op: a debit and a credit of
   * the same amount on the same account is a balanced entry that changes nothing, and
   * booking it would put a pair of meaningless lines on the customer's statement.
   */
  async requirePayee(input: {
    destination: TransferDestination;
    payerUserId: string;
    source: AccountRecord;
    amount: Money;
    session?: ClientSession;
  }): Promise<ResolvedPayee> {
    const payee = await this.payees.require({
      destination: input.destination,
      payerUserId: input.payerUserId,
      ...(input.session ? { session: input.session } : {}),
    });

    if (payee.account.id === input.source.id) {
      throw new AppError({
        code: ErrorCode.SAME_ACCOUNT_TRANSFER,
        message: 'That is the account the money is coming from. Choose a different payee.',
        context: { accountId: input.source.id },
      });
    }

    assertAccountUsable(payee.account);
    assertReceivable(payee.account, input.amount);
    return payee;
  }

  /** What the product charges for this movement. Quotes only; consumes no allowance. */
  async priceFee(input: {
    rail: TransferRail;
    source: AccountRecord;
    amount: Money;
    session?: ClientSession;
  }): Promise<FeeQuote> {
    const kind = feeKindFor(input.rail);
    if (!kind) return freeOfCharge(input.amount.currency);

    const product = await this.productFor(input.source, input.session);
    return this.fees.quote(
      { accountId: input.source.id, product, kind, amount: input.amount },
      input.session,
    );
  }

  /**
   * Prices the fee *and* consumes one use of its monthly allowance.
   *
   * Called only from inside the transaction that books the fee. If the payment rolls back
   * so does the counter — otherwise an abandoned transfer would burn one of the customer's
   * free ones. Quoting and charging are separate calls on the products lane's service for
   * exactly this reason, and this method is the charging half.
   */
  async chargeFee(input: {
    kind: FeeKind | null;
    source: AccountRecord;
    amount: Money;
    session: ClientSession;
  }): Promise<FeeQuote> {
    if (!input.kind) return freeOfCharge(input.amount.currency);

    const product = await this.productFor(input.source, input.session);
    return this.fees.charge(
      { accountId: input.source.id, product, kind: input.kind, amount: input.amount },
      input.session,
    );
  }

  /** The limit window this movement is measured against, from the account's own terms. */
  async limitQueryFor(
    rail: TransferRail,
    source: AccountRecord,
    session?: ClientSession,
  ): Promise<LimitQuery> {
    const product = await this.productFor(source, session);
    const scope = limitScopeFor(rail);

    return {
      accountId: source.id,
      scope,
      matrix: matrixFor(product, scope),
      currency: source.currency as CurrencyCode,
    };
  }

  /**
   * The exact product version the account was opened on.
   *
   * Not the current version: an account is priced by the terms it was sold, however many
   * times the catalogue has been republished since.
   */
  private async productFor(source: AccountRecord, session?: ClientSession) {
    return this.products.getVersion(source.productCode, source.productVersion, session);
  }
}

/** The quote for a movement the catalogue does not price at all. */
function freeOfCharge(currency: CurrencyCode): FeeQuote {
  return {
    kind: 'DOMESTIC_TRANSFER',
    label: 'No transfer fee',
    fee: Money.zero(currency),
    waivedBy: 'NOT_PRICED',
    freeRemaining: 0,
  };
}

/**
 * The payee's account must be able to hold what is being sent.
 *
 * A currency mismatch on the receiving side is caught here rather than by the ledger,
 * because the ledger's answer — an unbalanced entry — is a defect report, not something a
 * customer can act on.
 */
function assertReceivable(account: AccountRecord, amount: Money): void {
  if (account.currency === (amount.currency as string)) return;

  throw new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `That payee's account holds ${account.currency}, not ${amount.currency}.`,
    context: { payeeCurrency: account.currency, requested: amount.currency },
  });
}
