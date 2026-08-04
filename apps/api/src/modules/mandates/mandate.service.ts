import { Injectable } from '@nestjs/common';

import { ErrorCode, MandateStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { toStored } from '../../common/money/money.codec.js';
import { AccountService, assertAccountUsable } from '../accounts/index.js';

import {
  ADVANCE_NOTICE_DAYS,
  FREQUENCY_DAYS,
  MS_PER_DAY,
  type MandateFrequency,
} from './mandate.constants.js';
import { MandateStore, type MandateRecord } from './mandate.store.js';

/** Mandates returned by the customer's list when no limit is given. */
const LIST_LIMIT = 100;

/** Everything a merchant supplies when setting up an authority. */
export interface MandateSetup {
  readonly userId: string;
  readonly accountId: string;
  readonly merchantName: string;
  readonly merchantLogoUrl?: string;
  readonly reference: string;
  readonly frequency: MandateFrequency;
  /** Null for a variable-amount mandate such as a utility bill. */
  readonly fixedAmount?: Money;
  /** The ceiling the customer agreed to. A collection above it is refused outright. */
  readonly maxAmount?: Money;
  /** First collection date. Defaults to the scheme's advance-notice period from today. */
  readonly firstCollectionAt?: Date;
}

/**
 * Setting up, pausing and cancelling a standing authority.
 *
 * **Cancellation is immediate and unilateral.** The customer does not have to ask the
 * merchant, give a reason or wait for a period of notice — that is what a direct debit
 * mandate is, and a bank that made cancelling harder than setting up would be the story.
 * Cancelling is also final: a cancelled mandate cannot be reactivated, because reviving an
 * authority the customer withdrew is the merchant's job to ask for again.
 *
 * **Pausing is the reversible one.** A customer who wants a month off gets `PAUSED`, and
 * the collection sweep skips them for exactly as long as they say.
 */
@Injectable()
export class MandateService {
  constructor(
    private readonly mandates: MandateStore,
    private readonly accounts: AccountService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Registers a new authority against the customer's account.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND` when the account is not theirs, and
   *   `ACCOUNT_FROZEN` / `ACCOUNT_CLOSED` when it cannot support collections.
   */
  async setUp(setup: MandateSetup): Promise<MandateRecord> {
    const account = await this.accounts.requireOwned({
      userId: setup.userId,
      accountId: setup.accountId,
    });
    assertAccountUsable(account);

    return this.mandates.insert({
      userId: setup.userId,
      merchantName: setup.merchantName,
      merchantLogoUrl: setup.merchantLogoUrl ?? null,
      accountId: account.id,
      reference: setup.reference,
      fixedAmount: setup.fixedAmount ? toStored(setup.fixedAmount) : null,
      maxAmount: setup.maxAmount ? toStored(setup.maxAmount) : null,
      frequency: setup.frequency,
      nextExpectedAt: setup.firstCollectionAt ?? this.afterNotice(),
      createdAt: this.clock.now(),
    });
  }

  async list(input: {
    userId: string;
    status?: MandateStatus;
    accountId?: string;
  }): Promise<readonly MandateRecord[]> {
    return this.mandates.list({
      userId: input.userId,
      limit: LIST_LIMIT,
      ...(input.status ? { status: input.status } : {}),
      ...(input.accountId ? { accountId: input.accountId } : {}),
    });
  }

  async get(userId: string, mandateId: string): Promise<MandateRecord> {
    const mandate = await this.mandates.findById(mandateId, userId);
    if (!mandate) throw AppError.notFound('That Direct Debit', mandateId);
    return mandate;
  }

  /**
   * Applies the status the customer asked for.
   *
   * `ACTIVE`, `PAUSED` and `CANCELLED` are the three a customer may choose. `EXPIRED` is the
   * bank's own bookkeeping and is not offered, because a customer declaring their own
   * mandate expired would mean something different from the scheme's use of the word.
   */
  async setStatus(input: {
    userId: string;
    mandateId: string;
    status: MandateStatus;
  }): Promise<MandateRecord> {
    const mandate = await this.get(input.userId, input.mandateId);
    assertCustomerChoosable(input.status);
    assertNotCancelled(mandate);

    const updated = await this.mandates.transition({
      id: mandate.id,
      userId: input.userId,
      fromStatuses: [MandateStatus.ACTIVE, MandateStatus.PAUSED],
      status: input.status,
      cancelledAt: input.status === MandateStatus.CANCELLED ? this.clock.now() : null,
    });

    if (!updated) throw alreadyCancelled(mandate.id);
    return updated;
  }

  /** When the merchant may next collect, given the schedule they registered. */
  nextCollectionAfter(frequency: MandateFrequency, from: Date): Date | null {
    const days = FREQUENCY_DAYS[frequency];
    return days === null ? null : new Date(from.getTime() + days * MS_PER_DAY);
  }

  /** The earliest a merchant may collect: the scheme's advance-notice period from today. */
  private afterNotice(): Date {
    return new Date(this.clock.timestamp() + ADVANCE_NOTICE_DAYS * MS_PER_DAY);
  }
}

/** A cancelled mandate is finished. Nothing brings it back but a fresh authority. */
export function assertNotCancelled(mandate: MandateRecord): void {
  if (mandate.status !== MandateStatus.CANCELLED) return;
  throw alreadyCancelled(mandate.id);
}

export function alreadyCancelled(mandateId: string): AppError {
  return new AppError({
    code: ErrorCode.MANDATE_CANCELLED,
    message:
      'This Direct Debit has been cancelled. The merchant will need to ask you to set up a new one.',
    context: { mandateId },
  });
}

function assertCustomerChoosable(status: MandateStatus): void {
  const choosable: readonly MandateStatus[] = [
    MandateStatus.ACTIVE,
    MandateStatus.PAUSED,
    MandateStatus.CANCELLED,
  ];

  if (choosable.includes(status)) return;

  throw AppError.validation('Choose whether to pause, restart or cancel this Direct Debit.', [
    { path: 'status', message: 'must be ACTIVE, PAUSED or CANCELLED' },
  ]);
}
