import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  ChargeBearer,
  ErrorCode,
  NameCheckResult,
  TransferRail,
  type TransferQuote,
  type TransferQuoteRequest,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { toStored } from '../../common/money/money.codec.js';
import { type AccountRecord } from '../accounts/index.js';
import { PayeeTrust, type PayeeStanding } from '../beneficiaries/index.js';

import { QuoteStore, type NewQuote, type QuoteRecord } from './quote.store.js';
import { TransferGuardService } from './transfer-guard.service.js';
import { TransferPricingService } from './transfer-pricing.service.js';
import { feeKindFor, splitAroundFee, type TransferAmounts } from './transfer-rules.js';
import { QUOTE_TTL_MINUTES } from './transfer.constants.js';
import { toContractQuote } from './transfer.mapper.js';

/** Wording shown to the customer before they authorise. Never a reason to refuse. */
const WARNING = {
  chargeBearerIgnored: 'Charge options do not apply to payments inside Reliance.',
  closeNameMatch: 'The payee name is close but not an exact match. Check before you send.',
  noNameCheck: 'We could not confirm the payee name with their bank.',
  coolingOff: 'This payee is new, so larger payments are limited until the window passes.',
} as const;

/**
 * Pricing a transfer, and committing to that price for a window.
 *
 * Everything contestable happens here — resolving the payee, pricing the fee, testing the
 * limits, deciding whether step-up is owed — and the answer is *persisted*. Execution then
 * binds to the stored quote instead of running the same code again against a world that
 * has moved. That is what "never reprice silently underneath the customer" means in
 * practice: the figures on the confirmation screen and the figures that hit the account are
 * the same bytes, not two computations that ought to agree.
 *
 * A quote is not an authorisation. Nothing here reserves funds, consumes an allowance or
 * writes to the ledger — a customer who abandons a payment must not have lost a free
 * transfer, and a quote that reserved money would let anybody freeze an account by quoting
 * repeatedly. Every check run here is run again, inside the transaction, at execution.
 */
@Injectable()
export class TransferQuoteService {
  constructor(
    private readonly pricing: TransferPricingService,
    private readonly guard: TransferGuardService,
    private readonly quotes: QuoteStore,
    private readonly clock: ClockService,
  ) {}

  /** Prices a transfer and stores the quote execution will bind to. */
  async quote(input: { userId: string; request: TransferQuoteRequest }): Promise<TransferQuote> {
    return toContractQuote(await this.priceAndStore(input));
  }

  /** {@link quote}, returning the stored record — the shape the execution path wants. */
  async priceAndStore(input: {
    userId: string;
    request: TransferQuoteRequest;
    session?: ClientSession;
  }): Promise<QuoteRecord> {
    const rail = this.pricing.assertSupportedRail(input.request.destination);
    const source = await this.pricing.requireSource({
      userId: input.userId,
      accountId: input.request.sourceAccountId,
      ...(input.session ? { session: input.session } : {}),
    });

    const draft = await this.price({ input, rail, source });
    return this.quotes.insert(draft, input.session);
  }

  /**
   * Loads a quote for execution.
   *
   * @throws {AppError} `QUOTE_NOT_FOUND` for a quote that is missing or another customer's,
   *   and `QUOTE_EXPIRED` for one whose window has closed.
   */
  async requireExecutable(input: {
    userId: string;
    quoteId: string;
    session?: ClientSession;
  }): Promise<QuoteRecord> {
    const quote = await this.quotes.findById(input.quoteId, input.userId, input.session);
    if (!quote) throw quoteNotFound(input.quoteId);
    if (quote.expiresAt.getTime() <= this.clock.timestamp()) throw quoteExpired(quote);
    return quote;
  }

  /** Everything the quote document needs, priced but not yet written. */
  private async price(context: {
    input: { userId: string; request: TransferQuoteRequest; session?: ClientSession };
    rail: TransferRail;
    source: AccountRecord;
  }): Promise<NewQuote> {
    const { input, rail, source } = context;
    const session = input.session;
    const amount = this.pricing.requireAmount(input.request.amount, source);

    const payee = await this.pricing.requirePayee({
      destination: input.request.destination,
      payerUserId: input.userId,
      source,
      amount,
      ...(session ? { session } : {}),
    });

    const feeQuote = await this.pricing.priceFee({
      rail,
      source,
      amount,
      ...(session ? { session } : {}),
    });
    const amounts = splitAroundFee({
      amount,
      fee: feeQuote.fee,
      amountIsReceiveSide: input.request.amountIsReceiveSide,
    });

    const standing = await this.guard.assess({
      userId: input.userId,
      destination: input.request.destination,
      ownAccount: payee.ownAccount,
      amount: amounts.creditAmount,
      resolved: { accountId: payee.account.id, accountNumber: payee.account.number },
      ...(session ? { session } : {}),
    });

    await this.assertAllowed({ rail, source, amounts, standing, session });

    return this.draftFor({ input, rail, source, payee: payee.account.id, amounts, standing });
  }

  /**
   * The two refusals a quote must make before it promises anything.
   *
   * Run here so the customer is told *before* they authorise, and run again inside the
   * execution transaction because a limit counter or a payee's standing can move in the
   * fifteen minutes a quote is good for.
   */
  private async assertAllowed(context: {
    rail: TransferRail;
    source: AccountRecord;
    amounts: TransferAmounts;
    standing: PayeeStanding;
    session?: ClientSession;
  }): Promise<void> {
    await this.guard.assertAllowed({
      limitQuery: await this.pricing.limitQueryFor(context.rail, context.source, context.session),
      debit: context.amounts.debitAmount,
      credit: context.amounts.creditAmount,
      standing: context.standing,
      ...(context.session ? { session: context.session } : {}),
    });
  }

  private draftFor(context: {
    input: { userId: string; request: TransferQuoteRequest };
    rail: TransferRail;
    source: AccountRecord;
    payee: string;
    amounts: TransferAmounts;
    standing: PayeeStanding;
  }): NewQuote {
    const now = this.clock.now();

    return {
      userId: context.input.userId,
      rail: context.rail,
      sourceAccountId: context.source.id,
      destination: context.input.request.destination,
      destinationAccountId: context.payee,
      debitAmount: toStored(context.amounts.debitAmount),
      creditAmount: toStored(context.amounts.creditAmount),
      fee: toStored(context.amounts.fee),
      feeKind: feeKindFor(context.rail),
      // Same-currency by construction — a cross-currency internal transfer is refused in
      // `requireAmount` — so there is no rate to quote and nothing for it to expire.
      exchangeRate: null,
      rateExpiresAt: null,
      chargeBearer: context.input.request.chargeBearer,
      requiresStepUp: context.standing.requiresStepUp,
      warnings: warningsFor(context),
      // An internal transfer settles inside the transaction that books it, so the estimate
      // is not an estimate.
      estimatedArrival: now,
      cutOffAt: null,
      expiresAt: this.clock.inMinutes(QUOTE_TTL_MINUTES),
      createdAt: now,
    };
  }
}

/** The advisory notes attached to a quote, in the order a customer should read them. */
function warningsFor(context: {
  rail: TransferRail;
  standing: PayeeStanding;
  input: { request: TransferQuoteRequest };
}): string[] {
  const warnings: string[] = [];
  const nameCheck = context.standing.beneficiary?.nameCheck;

  if (
    context.rail === TransferRail.INTERNAL &&
    context.input.request.chargeBearer !== ChargeBearer.SHA
  ) {
    warnings.push(WARNING.chargeBearerIgnored);
  }
  if (nameCheck === NameCheckResult.CLOSE_MATCH) warnings.push(WARNING.closeNameMatch);
  if (nameCheck === NameCheckResult.UNAVAILABLE) warnings.push(WARNING.noNameCheck);
  if (context.standing.trust === PayeeTrust.COOLING_OFF) warnings.push(WARNING.coolingOff);

  return warnings;
}

function quoteNotFound(quoteId: string): AppError {
  return new AppError({
    code: ErrorCode.QUOTE_NOT_FOUND,
    message: 'That quote no longer exists. Ask for a new one.',
    context: { quoteId },
  });
}

function quoteExpired(quote: { id: string; expiresAt: Date }): AppError {
  return new AppError({
    code: ErrorCode.QUOTE_EXPIRED,
    message: 'This quote has expired. Ask for a new one — we will not send it on an old price.',
    context: { quoteId: quote.id, expiredAt: quote.expiresAt.toISOString() },
  });
}
