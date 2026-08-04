import { RecurrenceFrequency, type CreateTransferOrderRequest } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import {
  type AccountRecord,
  type AccountService,
  type OwnedAccountRef,
} from '../../accounts/index.js';
import { type BeneficiaryService } from '../../beneficiaries/index.js';
import { InMemoryTransferOrderStore } from '../in-memory-transfer-order.store.js';
import { TransferOrderLifecycleService } from '../transfer-order-lifecycle.service.js';
import { TransferOrderService } from '../transfer-order.service.js';

export const CUSTOMER = 'usr_01JQ8Z0000000000000000000A';
export const STRANGER = 'usr_01JQ8Z0000000000000000000B';
export const ACCOUNT = 'acc_01JQ8Z0000000000000000000A';
export const PAYEE = 'ben_01JQ8Z0000000000000000000A';

/** A Wednesday, so weekday defaulting in the tests is checkable by hand. */
export const TODAY = '2026-08-05';

export function frozenClock(iso = `${TODAY}T09:00:00.000Z`): ClockService {
  const clock = new ClockService();
  clock.freezeAt(new Date(iso));
  return clock;
}

/** An account service that owns exactly one usable sterling account. */
export class StubAccounts {
  async requireOwned(reference: OwnedAccountRef): Promise<AccountRecord> {
    const { accountId, userId } = reference;
    if (accountId !== ACCOUNT || userId !== CUSTOMER) {
      throw new AppError({ code: 'ACCOUNT_NOT_FOUND', message: 'No such account.' });
    }

    return {
      id: accountId,
      userId,
      status: 'ACTIVE',
      currency: 'GBP',
      holderIds: [userId],
    } as unknown as AccountRecord;
  }

  asService(): AccountService {
    return this as unknown as AccountService;
  }
}

/** A payee directory holding exactly one saved payee, for exactly one customer. */
export class StubBeneficiaries {
  async require(userId: string, beneficiaryId: string): Promise<{ id: string }> {
    if (userId !== CUSTOMER || beneficiaryId !== PAYEE) {
      throw new AppError({ code: 'BENEFICIARY_NOT_FOUND', message: 'No such payee.' });
    }
    return { id: beneficiaryId };
  }

  asService(): BeneficiaryService {
    return this as unknown as BeneficiaryService;
  }
}

/** The two services under test, over an in-memory store and a frozen clock. */
export function rig(now?: string) {
  const clock = frozenClock(now);
  const orders = new InMemoryTransferOrderStore(new IdGenerator());
  const service = new TransferOrderService(
    orders,
    new StubAccounts().asService(),
    new StubBeneficiaries().asService(),
    clock,
  );
  const lifecycle = new TransferOrderLifecycleService(orders, service, clock);

  return { clock, orders, service, lifecycle };
}

/** £250 of rent on the 31st, which is the case month-end clamping exists for. */
export function orderRequest(
  overrides: Partial<CreateTransferOrderRequest> = {},
): CreateTransferOrderRequest {
  return {
    name: 'Rent',
    sourceAccountId: ACCOUNT,
    beneficiaryId: PAYEE,
    amount: { amount: '25000', currency: 'GBP' },
    frequency: RecurrenceFrequency.MONTHLY,
    startsOn: '2026-08-31',
    dayOfMonth: 31,
    ...overrides,
  };
}

/** The contract error code a rejected call carried, or why it did not carry one. */
export async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_AN_APP_ERROR';
  }

  return 'NO_ERROR_THROWN';
}
