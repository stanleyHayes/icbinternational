import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  ErrorCode,
  type CreateBeneficiaryRequest,
  type TransferDestination,
} from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { COOLING_OFF_HOURS } from './beneficiary.constants.js';
import { BeneficiaryService } from './beneficiary.service.js';
import { type BeneficiaryRecord } from './beneficiary.store.js';
import {
  coolingOffCeiling,
  PayeeTrust,
  requiresStepUp,
  trustOf,
  withinCoolingOffCeiling,
} from './cooling-off.js';
import { destinationKeys, resolvedInternalKeys } from './destination-key.js';

/** Where a payee stands, and what that implies for the payment in front of them. */
export interface PayeeStanding {
  readonly trust: PayeeTrust;
  /** The saved payee this destination matched, if any. */
  readonly beneficiary: BeneficiaryRecord | null;
  /** The keys the destination was recognised by; reused when saving it. */
  readonly keys: readonly string[];
  readonly requiresStepUp: boolean;
}

/**
 * The cooling-off gate every outgoing payment passes through.
 *
 * The arithmetic lives in `cooling-off.ts`, beside the thresholds; this service is the
 * lookup and the enforcement. Splitting them that way means the rule can be reasoned about
 * — and tested — without a store, while there is still exactly one place that decides
 * whether a given payment is allowed to leave.
 *
 * **An unsaved destination is treated as new, not as exempt.** That is the whole point:
 * authorised-push-payment fraud does not begin with the victim saving a payee, it begins
 * with them being talked through a one-off payment. A rule that only applied to saved
 * payees would be a rule that never fired on the attack it exists to stop. Moving money
 * between your own accounts is exempt, because there is no payee to be defrauded by.
 */
@Injectable()
export class PayeeTrustService {
  constructor(
    private readonly beneficiaries: BeneficiaryService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Where the destination stands for this customer, without judging the amount.
   *
   * @param input.resolved The internal account the destination points at, when it has been
   *   resolved. Supplying it lets a payee saved by email be recognised by account number.
   */
  async standingFor(input: {
    userId: string;
    destination: TransferDestination;
    ownAccount: boolean;
    resolved?: { accountId: string; accountNumber: string };
    session?: ClientSession;
  }): Promise<PayeeStanding> {
    const keys = candidateKeys(input.destination, input.resolved);

    const beneficiary = input.ownAccount
      ? null
      : await this.beneficiaries.findMatching({
          userId: input.userId,
          keys,
          ...(input.session ? { session: input.session } : {}),
        });

    return {
      trust: trustOf({
        ownAccount: input.ownAccount,
        trustedFrom: beneficiary?.trustedFrom ?? null,
        now: this.clock.now(),
      }),
      beneficiary,
      keys,
      requiresStepUp: false,
    };
  }

  /** {@link standingFor}, with the amount folded in so `requiresStepUp` is meaningful. */
  async assess(input: {
    userId: string;
    destination: TransferDestination;
    ownAccount: boolean;
    amount: Money;
    resolved?: { accountId: string; accountNumber: string };
    session?: ClientSession;
  }): Promise<PayeeStanding> {
    const standing = await this.standingFor(input);
    return { ...standing, requiresStepUp: requiresStepUp(standing.trust, input.amount) };
  }

  /**
   * Records that a payee was paid, saving them first when the customer asked.
   *
   * The saved record carries the keys the destination was *recognised* by, not only the one
   * the customer typed. Paying `alice@example.com` today and her account number next month
   * is the same payee, and only the resolved account key makes those two the same row — so
   * the cooling-off window that starts today still applies to the payment next month.
   *
   * @param input.nickname What to file the payee under. Null means "do not save".
   * @returns The payee's id, or null when nothing was saved and nothing matched.
   */
  async recordUse(input: {
    userId: string;
    standing: PayeeStanding;
    destination: TransferDestination;
    currency: string;
    nickname: string | null;
    session?: ClientSession;
  }): Promise<string | null> {
    const existing = input.standing.beneficiary;

    if (existing) {
      await this.beneficiaries.markUsed(existing.id, input.session);
      return existing.id;
    }

    if (input.nickname === null) return null;

    const saved = await this.beneficiaries.create({
      userId: input.userId,
      request: {
        nickname: input.nickname,
        destination: input.destination,
        currency: input.currency as CreateBeneficiaryRequest['currency'],
        isFavourite: false,
      },
      extraKeys: input.standing.keys,
      ...(input.session ? { session: input.session } : {}),
    });

    return saved.id;
  }

  /**
   * Refuses a payment that exceeds what an untrusted payee may receive.
   *
   * @throws {AppError} `BENEFICIARY_COOLING_OFF`, carrying the ceiling and — when the payee
   *   is saved — the instant the window closes, so the client can say "£1,000 now, or the
   *   full amount after 09:00 tomorrow" instead of "declined".
   */
  assertPayable(standing: PayeeStanding, amount: Money): void {
    if (withinCoolingOffCeiling(standing.trust, amount)) return;

    const ceiling = coolingOffCeiling(amount.currency);
    const opensAt = standing.beneficiary?.trustedFrom ?? null;

    throw new AppError({
      code: ErrorCode.BENEFICIARY_COOLING_OFF,
      message: describeRefusal(standing.trust, ceiling.format(), opensAt),
      details: [{ path: 'amount', message: `New payees are limited to ${ceiling.format()}` }],
      context: {
        trust: standing.trust,
        ceiling: ceiling.toJSON(),
        requested: amount.toJSON(),
        opensAt: opensAt?.toISOString() ?? null,
      },
    });
  }
}

/** Everything the destination could be recognised by, including its resolved account. */
function candidateKeys(
  destination: TransferDestination,
  resolved: { accountId: string; accountNumber: string } | undefined,
): string[] {
  const resolvedKeys = resolved ? resolvedInternalKeys(resolved) : [];
  return [...new Set([...destinationKeys(destination), ...resolvedKeys])];
}

function describeRefusal(trust: PayeeTrust, ceiling: string, opensAt: Date | null): string {
  if (trust === PayeeTrust.UNKNOWN) {
    return (
      `New payees are limited to ${ceiling} for their first ${COOLING_OFF_HOURS} hours. ` +
      'Save this payee and the full amount will be available once the window passes.'
    );
  }

  const when = opensAt ? ` The full amount is available from ${opensAt.toISOString()}.` : '';
  return `This payee was added recently, so payments are limited to ${ceiling} for now.${when}`;
}
