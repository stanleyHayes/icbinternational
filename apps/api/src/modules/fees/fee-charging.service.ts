import { Injectable } from '@nestjs/common';

import { type FeeKind } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { AccountStore } from '../accounts/index.js';
import { FeeService as ProductFeeService, ProductService } from '../products/index.js';

import { CustomerTierPort } from './customer-tier.port.js';
import { type FeeChargeRecord } from './fee-charge.store.js';
import { FeePostingService, type FeeBookingInput } from './fee-posting.service.js';
import { eventChargeKey, FeeChargeSource } from './fees.constants.js';

/** A discrete billable event: an ATM withdrawal, a late payment, an FX markup. */
export interface EventFeeInput {
  readonly accountId: string;
  readonly kind: FeeKind;
  /** Amount a proportional fee applies to. Zero for a flat-only fee. */
  readonly amount: Money;
  /**
   * The caller's stable identifier for the event (a card authorisation id, a quote id).
   * The dedupe key derives from it, so a retried caller can never be charged twice.
   */
  readonly sourceId: string;
  /** Null to use the schedule entry's own label. */
  readonly description?: string;
}

/** A fully-specified assessment, as the maintenance sweep drives it. */
export interface AssessFeeInput extends FeeBookingInput {
  /** Amount a proportional fee applies to. Zero for a flat-only fee. */
  readonly amount: Money;
}

/**
 * The fees engine's front door.
 *
 * Resolves everything a charge needs that the caller cannot know — the account, the
 * product version it was sold under, the customer's pricing tier — and hands the write
 * half to {@link FeePostingService}. Pricing always follows the pinned product version:
 * an account is charged by the terms it was opened on, never by today's catalogue.
 *
 * Idempotent by construction: the replay check comes first, the unique `chargeKey`
 * index arbitrates races, and the ledger's unique `reference` backs both.
 */
@Injectable()
export class FeeChargingService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly products: ProductService,
    private readonly pricing: ProductFeeService,
    private readonly tiers: CustomerTierPort,
    private readonly posting: FeePostingService,
  ) {}

  /**
   * Charges a fee for a discrete event: ATM, international, late payment, FX markup.
   *
   * Safe to call from a retrying job or a redelivered message — the same `sourceId`
   * always yields the same charge record, and only ever books one journal entry.
   */
  async chargeEventFee(input: EventFeeInput): Promise<FeeChargeRecord> {
    return this.assess({
      accountId: input.accountId,
      kind: input.kind,
      amount: input.amount,
      chargeKey: eventChargeKey(input.kind, input.sourceId),
      periodKey: null,
      source: FeeChargeSource.EVENT,
      sourceId: input.sourceId,
      description: input.description ?? null,
    });
  }

  /**
   * Charges a fee under an explicit dedupe key.
   *
   * The general path: event fees reach it through {@link chargeEventFee}, the
   * maintenance sweep drives it directly with a `kind:accountId:period` key and a
   * pro-rating fraction.
   */
  async assess(input: AssessFeeInput): Promise<FeeChargeRecord> {
    const replay = await this.posting.findByChargeKey(input.chargeKey);
    if (replay) return replay;

    const account = await this.accounts.findById(input.accountId);
    if (!account) throw AppError.notFound('Account', input.accountId);

    const product = await this.products.getVersion(account.productCode, account.productVersion);
    const tier = await this.tiers.tierFor(input.accountId);

    return this.posting.book(input, (session) =>
      this.pricing.charge(
        {
          accountId: input.accountId,
          product,
          kind: input.kind,
          amount: input.amount,
          tier,
        },
        session,
      ),
    );
  }
}
