import { Injectable, Logger } from '@nestjs/common';

import { type CreateTransferOrderRequest } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { toStored } from '../../common/money/money.codec.js';
import { type PageResult } from '../../common/pagination/cursor.js';
import { AccountService, assertAccountUsable } from '../accounts/index.js';
import { BeneficiaryService } from '../beneficiaries/index.js';
import { fromIsoDate } from '../loans/index.js';

import {
  assertCurrencyMatches,
  assertEndAfterStart,
  assertSchedulePays,
  assertStartNotPast,
  orderNotFound,
  requirePayableAmount,
} from './transfer-order.rules.js';
import { anchorsFor, firstRunOn, type Schedule } from './transfer-order.schedule.js';
import {
  TransferOrderStore,
  type NewTransferOrder,
  type TransferOrderListQuery,
  type TransferOrderRecord,
} from './transfer-order.store.js';

/**
 * Setting up a standing order, and reading the ones a customer has.
 *
 * **Ownership is enforced here, not in the controller.** Every read goes through
 * {@link get}, which scopes the query to the customer and answers 404 for an order that is
 * not theirs. A 403 would be the worse answer: it confirms the id is real, which is all
 * somebody walking an id space needs.
 *
 * **Creating one commits the customer to future money movement**, so the request is checked
 * as hard as a payment would be — the account is theirs and usable, the payee is theirs,
 * the amount is payable and in the account's currency, and the rule produces at least one
 * date. A standing order that looks set up and never pays is the failure worth spending
 * validation on.
 *
 * Changing one afterwards lives in `TransferOrderLifecycleService`. Keeping the two apart
 * is what keeps this file about "may this be set up at all" and that one about "what does
 * this change mean to a schedule that is already running".
 */
@Injectable()
export class TransferOrderService {
  private readonly logger = new Logger(TransferOrderService.name);

  constructor(
    private readonly orders: TransferOrderStore,
    private readonly accounts: AccountService,
    private readonly beneficiaries: BeneficiaryService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Registers a standing order against the customer's own account and payee.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND` / `BENEFICIARY_NOT_FOUND` when either is not
   *   theirs, `ACCOUNT_FROZEN` / `ACCOUNT_CLOSED` when the account cannot pay,
   *   `CURRENCY_MISMATCH`, `INVALID_AMOUNT`, and `VALIDATION_FAILED` for a rule that never
   *   pays.
   */
  async create(input: {
    userId: string;
    request: CreateTransferOrderRequest;
  }): Promise<TransferOrderRecord> {
    const draft = await this.draft(input.userId, input.request);
    const order = await this.orders.insert(draft);

    this.logger.log(`Standing order ${order.id} set up for ${input.userId}`);
    return order;
  }

  async list(
    userId: string,
    query: Omit<TransferOrderListQuery, 'userId'>,
  ): Promise<PageResult<TransferOrderRecord>> {
    return this.orders.list({ userId, ...query });
  }

  /** The order, or a 404 that does not distinguish "not yours" from "not there". */
  async get(userId: string, orderId: string): Promise<TransferOrderRecord> {
    const order = await this.orders.findOwnedById(orderId, userId);
    if (!order) throw orderNotFound(orderId);
    return order;
  }

  /** Everything checked and derived, in the shape the store accepts. */
  private async draft(
    userId: string,
    request: CreateTransferOrderRequest,
  ): Promise<NewTransferOrder> {
    const account = await this.accounts.requireOwned({
      userId,
      accountId: request.sourceAccountId,
    });
    assertAccountUsable(account);
    await this.beneficiaries.require(userId, request.beneficiaryId);

    const amount = requirePayableAmount(request.amount);
    assertCurrencyMatches(request.amount, account.currency);

    const schedule = this.plan(request);
    const firstRun = firstRunOn(schedule);
    assertSchedulePays(firstRun);

    return {
      userId,
      name: request.name,
      sourceAccountId: account.id,
      beneficiaryId: request.beneficiaryId,
      amount: toStored(amount),
      reference: request.reference ?? null,
      ...schedule,
      nextRunAt: fromIsoDate(firstRun),
      createdAt: this.clock.now(),
    };
  }

  /** The recurrence rule, defaulted from the start date and checked against the business date. */
  private plan(request: CreateTransferOrderRequest): Schedule {
    assertStartNotPast(request.startsOn, this.clock.today());
    assertEndAfterStart(request.startsOn, request.endsOn ?? null);

    return {
      frequency: request.frequency,
      ...anchorsFor(request),
      startsOn: request.startsOn,
      endsOn: request.endsOn ?? null,
      maxOccurrences: request.maxOccurrences ?? null,
    };
  }
}
