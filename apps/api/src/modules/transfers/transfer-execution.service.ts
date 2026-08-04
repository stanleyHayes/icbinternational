import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, type CreateTransferRequest } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import { type AccountRecord } from '../accounts/index.js';
import { type PayeeStanding } from '../beneficiaries/index.js';

import { type QuoteRecord } from './quote.store.js';
import { TransferBookingService, type BookingContext } from './transfer-booking.service.js';
import { TransferGuardService } from './transfer-guard.service.js';
import { TransferPricingService } from './transfer-pricing.service.js';
import { TransferQuoteService } from './transfer-quote.service.js';
import { type TransferRecord } from './transfer.store.js';

/** The customer's authorisation, as it arrives from the controller. */
export interface AuthorisedTransfer {
  readonly userId: string;
  readonly request: CreateTransferRequest;
  /** Proof of a recent re-authentication, when the quote said one was owed. */
  readonly stepUpToken?: string;
}

/**
 * The body of an internal transfer, start to finish, inside one session.
 *
 * The order of what happens here is the design, so it is worth reading as an order:
 *
 * 1. **Bind the quote.** A stale quote is refused rather than re-priced. The customer
 *    agreed to a set of figures; producing different ones is not a service to them.
 * 2. **Replay check.** A transfer already booked against this quote is returned unchanged.
 *    This is the cheap layer — the unique index on `quoteId` is the one that is actually
 *    load-bearing under concurrency.
 * 3. **Step up**, if the quote said the payment was large enough or the payee new enough.
 * 4. **Re-validate everything**, against the transactional snapshot rather than the quote's
 *    fifteen-minute-old view: the account may have been frozen, spent or limit-exhausted.
 * 5. **Post, then record.** The ledger moves the money; the transfer row describes it.
 *
 * Every refusal happens before any write, so a rejected payment leaves nothing behind to
 * clean up — which is the property "no partial state" actually means.
 */
@Injectable()
export class TransferExecutionService {
  private readonly logger = new Logger(TransferExecutionService.name);

  constructor(
    private readonly quotes: TransferQuoteService,
    private readonly pricing: TransferPricingService,
    private readonly guard: TransferGuardService,
    private readonly booking: TransferBookingService,
  ) {}

  /** Runs the whole transfer in the caller's transaction. */
  async run(input: AuthorisedTransfer, session: ClientSession): Promise<TransferRecord> {
    const quote = await this.quotes.requireExecutable({
      userId: input.userId,
      quoteId: input.request.quoteId,
      session,
    });

    const already = await this.booking.findByQuote(quote.id, session);
    if (already) {
      this.logger.log(`Quote ${quote.id} already booked ${already.id}; replaying that answer`);
      return already;
    }

    if (quote.requiresStepUp) await this.guard.assertStepUp(input.userId, input.stepUpToken);

    const validated = await this.validate(input, quote, session);
    return this.book(input, validated, session);
  }

  /**
   * Re-runs every refusal the quote ran, against the transactional snapshot.
   *
   * Nothing here trusts the quote's verdict, only its *figures*. A quote is a promise about
   * price, never a promise the payment will succeed.
   */
  private async validate(
    input: AuthorisedTransfer,
    quote: QuoteRecord,
    session: ClientSession,
  ): Promise<ValidatedTransfer> {
    const source = await this.pricing.requireSource({
      userId: input.userId,
      accountId: quote.sourceAccountId,
      session,
    });

    const debit = fromStored(quote.debitAmount);
    const credit = fromStored(quote.creditAmount);

    const payee = await this.pricing.requirePayee({
      destination: quote.destination,
      payerUserId: input.userId,
      source,
      amount: credit,
      session,
    });
    assertSamePayee(quote, payee.account.id);

    // Funds first: the check most likely to fail, and the cheapest to fail on.
    await this.guard.assertFunds(source.id, debit, session);

    const standing = await this.guard.assess({
      userId: input.userId,
      destination: quote.destination,
      ownAccount: payee.ownAccount,
      amount: credit,
      resolved: { accountId: payee.account.id, accountNumber: payee.account.number },
      session,
    });

    await this.guard.assertAllowed({
      limitQuery: await this.pricing.limitQueryFor(quote.rail, source, session),
      debit,
      credit,
      standing,
      session,
    });

    return { quote, source, standing, debit, credit, fee: fromStored(quote.fee) };
  }

  /** Posts the money, consumes the allowances, and records the transfer. */
  private async book(
    input: AuthorisedTransfer,
    validated: ValidatedTransfer,
    session: ClientSession,
  ): Promise<TransferRecord> {
    const { quote, source, fee } = validated;

    const beneficiaryId = await this.guard.recordPayee({
      userId: input.userId,
      standing: validated.standing,
      destination: quote.destination,
      currency: quote.creditAmount.currency,
      nickname: nicknameFor(input.request),
      session,
    });

    const context: BookingContext = {
      quote,
      reference: input.request.reference ?? null,
      metadata: input.request.metadata ?? {},
      beneficiaryId,
      session,
    };

    const entryId = await this.booking.postTransfer(context);
    const feeEntryId = fee.isPositive ? await this.chargeAndPost(context, validated) : null;

    await this.guard.recordUsage(
      await this.pricing.limitQueryFor(quote.rail, source, session),
      validated.debit,
      session,
    );

    return this.booking.record(context, { entryId, feeEntryId });
  }

  /**
   * Books the fee and burns one use of its monthly allowance, in that order.
   *
   * Both inside the payment's transaction: if anything after this throws, the customer
   * neither pays the fee nor loses the free transfer they had not actually used.
   */
  private async chargeAndPost(
    context: BookingContext,
    validated: ValidatedTransfer,
  ): Promise<string> {
    const entryId = await this.booking.postFee(context, validated.fee);

    await this.pricing.chargeFee({
      kind: validated.quote.feeKind,
      source: validated.source,
      amount: validated.credit,
      session: context.session,
    });

    return entryId;
  }
}

/** The state a validated transfer carries into its write half. */
interface ValidatedTransfer {
  readonly quote: QuoteRecord;
  readonly source: AccountRecord;
  readonly standing: PayeeStanding;
  readonly debit: Money;
  readonly credit: Money;
  readonly fee: Money;
}

/** What to file a newly saved payee under, or null when the customer did not ask. */
function nicknameFor(request: CreateTransferRequest): string | null {
  if (!request.saveBeneficiary) return null;
  return request.beneficiaryNickname ?? request.reference ?? DEFAULT_PAYEE_NICKNAME;
}

/** Used when a customer saves a payee without naming them. */
const DEFAULT_PAYEE_NICKNAME = 'Saved payee';

/**
 * The destination must still resolve to the account it resolved to when priced.
 *
 * An email or a handle points at whichever of the payee's accounts is primary, and that can
 * change between the quote and the authorisation. The customer approved a payment to a
 * specific account; sending it elsewhere because a flag moved is precisely the silent
 * reprice this flow exists to prevent, so the quote is treated as expired instead.
 */
function assertSamePayee(quote: QuoteRecord, resolvedAccountId: string): void {
  if (quote.destinationAccountId === resolvedAccountId) return;

  throw new AppError({
    code: ErrorCode.QUOTE_EXPIRED,
    message: 'This payee has changed since we priced the payment. Ask for a new quote.',
    context: {
      quoteId: quote.id,
      quoted: quote.destinationAccountId,
      resolved: resolvedAccountId,
    },
  });
}
