import { Injectable } from '@nestjs/common';

import {
  AccountType,
  ErrorCode,
  type FieldError,
  type OpenAccountRequest,
  type Product,
} from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { UsersService, UserRepository } from '../auth/users/index.js';
import { checkEligibility, ProductService, type EligibilityDenial } from '../products/index.js';

/**
 * Denials that are deferred to activation rather than refusing the application.
 *
 * A minimum opening balance is a condition on the *account becoming usable*, not on the
 * customer being allowed to apply — there is nowhere to put the deposit until the account
 * exists. The account is therefore opened `PENDING` and activated by the posting that
 * satisfies the minimum. Every other denial is a genuine refusal.
 */
const DEFERRED_TO_ACTIVATION: readonly ErrorCode[] = [ErrorCode.AMOUNT_BELOW_MINIMUM];

/** Products that may be held jointly. Everything else is a single-holder relationship. */
const JOINT_CAPABLE_TYPES: readonly AccountType[] = [AccountType.CURRENT];

/**
 * Turns an application into a decision.
 *
 * Everything that has to be true before an account number is minted is settled here:
 * the product exists and is on sale, the applicant is verified far enough for it, the
 * currency is one the product is sold in, and every named joint holder is a real
 * customer. The result is a plan — the resolved facts the rest of opening consumes —
 * so that `AccountOpeningService` contains persistence and nothing else.
 *
 * The rules themselves live in `products/eligibility.ts` and are pure. This service is
 * the part that has to read a database to answer them.
 */
@Injectable()
export class AccountEligibilityService {
  constructor(
    private readonly products: ProductService,
    private readonly users: UsersService,
    private readonly userRecords: UserRepository,
  ) {}

  /**
   * Resolves an application, or refuses it.
   *
   * @throws {AppError} the first failed rule's contract code, with every failed rule in
   *   `details`. Reporting them all at once matters: a customer who fixes one reason and
   *   is handed the next has been made to guess how many are left.
   */
  async plan(input: { userId: string; request: OpenAccountRequest }): Promise<OpeningPlan> {
    const applicant = await this.users.requireById(input.userId);
    const product = await this.products.requireActive(input.request.productCode);
    const currency = input.request.currency;

    assertEligible(
      product,
      checkEligibility(product, {
        kycTier: applicant.kycTier,
        openingBalance: Money.zero(currency),
      }).denials,
    );

    const holderIds = await this.resolveHolders(input);

    return {
      userId: input.userId,
      product,
      currency,
      accountType: accountTypeFor(product, holderIds.length),
      holderIds,
      nickname: input.request.nickname ?? null,
    };
  }

  /**
   * The applicant first, then every additional holder, each resolved from their address.
   *
   * Addresses rather than ids because the customer adding their partner to an account
   * knows their email and has no way to know their `usr_` id — and because a customer id
   * accepted from a request body is an invitation to add a stranger to your account.
   */
  private async resolveHolders(input: {
    userId: string;
    request: OpenAccountRequest;
  }): Promise<string[]> {
    const holderIds = [input.userId];

    for (const [index, email] of input.request.additionalHolderEmails.entries()) {
      const holder = await this.userRecords.findByEmail(email);
      if (!holder) throw unknownHolder(index, email);
      if (holderIds.includes(holder.id)) throw duplicateHolder(index, email);
      holderIds.push(holder.id);
    }

    return holderIds;
  }
}

/** The resolved facts an account is built from. Every one of them is pinned at opening. */
export interface OpeningPlan {
  readonly userId: string;
  /** The exact product version in force today. The account is priced by it for life. */
  readonly product: Product;
  readonly currency: CurrencyCode;
  readonly accountType: AccountType;
  /** Primary holder first. */
  readonly holderIds: readonly string[];
  readonly nickname: string | null;
}

/** A second holder turns a current account into a joint one; nothing else may be shared. */
function accountTypeFor(product: Product, holderCount: number): AccountType {
  if (holderCount <= 1) return product.accountType;

  if (!JOINT_CAPABLE_TYPES.includes(product.accountType)) {
    throw new AppError({
      code: ErrorCode.PRECONDITION_FAILED,
      message: `${product.name} cannot be held jointly.`,
      context: { productCode: product.code, accountType: product.accountType },
    });
  }

  return AccountType.JOINT;
}

function assertEligible(product: Product, denials: readonly EligibilityDenial[]): void {
  const refusals = denials.filter((denial) => !DEFERRED_TO_ACTIVATION.includes(denial.code));
  const [first] = refusals;
  if (!first) return;

  throw new AppError({
    code: first.code,
    message: first.message,
    details: refusals.map((denial) => ({ path: 'productCode', message: denial.message })),
    context: { productCode: product.code },
  });
}

function unknownHolder(index: number, email: string): AppError {
  return AppError.validation('One of the additional holders is not a Reliance Bank customer.', [
    holderField(index, `${email} does not have a Reliance Bank account`),
  ]);
}

function duplicateHolder(index: number, email: string): AppError {
  return AppError.validation('An account holder was named twice.', [
    holderField(index, `${email} is already a holder of this account`),
  ]);
}

function holderField(index: number, message: string): FieldError {
  return { path: `additionalHolderEmails.${index}`, message };
}
