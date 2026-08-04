import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import {
  type AccountService,
  type AccountRecord,
  type OwnedAccountRef,
} from '../../accounts/index.js';
import { InMemoryPaymentRequestStore } from '../in-memory-payment-request.store.js';
import { PaymentRequestNotifierPort, type RequestEvent } from '../payment-request-notifier.port.js';
import { type PaymentRequestFactory } from '../payment-request.factory.js';
import { type PaymentRequestPoster } from '../payment-request.poster.js';
import { type NewPaymentRequest, type PaymentRequestRecord } from '../payment-request.store.js';

/** A session stand-in. The in-memory store ignores it, as the real one would use it. */
export const NO_SESSION = null as unknown as ClientSession;

export const REQUESTER = 'usr_01JQ8Z0000000000000000000A';
export const PAYER = 'usr_01JQ8Z0000000000000000000B';
export const DESTINATION = 'acc_01JQ8Z0000000000000000000A';
export const PAYER_ACCOUNT = 'acc_01JQ8Z0000000000000000000B';

/** A runner that executes the callback and lets a throw escape, as a rollback would. */
export function fakeRunner(): TransactionRunner {
  return {
    async run<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
      return work(NO_SESSION);
    },
    async runIn<T>(
      session: ClientSession | undefined,
      work: (session: ClientSession) => Promise<T>,
    ): Promise<T> {
      return work(session ?? NO_SESSION);
    },
  } as unknown as TransactionRunner;
}

/** A clock pinned to a known instant, so expiry is asserted rather than raced. */
export function frozenClock(iso = '2026-03-02T09:00:00.000Z'): ClockService {
  const clock = new ClockService();
  clock.freezeAt(new Date(iso));
  return clock;
}

export function requestStore(): InMemoryPaymentRequestStore {
  return new InMemoryPaymentRequestStore(new IdGenerator());
}

/**
 * A factory over the real expiry arithmetic, with the account and profile lookups stubbed.
 *
 * The parts that matter to these tests — the window, the token, the requester's name coming
 * from the profile rather than the request — are the real ones.
 */
export class StubRequestFactory {
  constructor(private readonly clock: ClockService) {}

  now(): Date {
    return this.clock.now();
  }

  async build(draft: {
    userId: string;
    destinationAccountId: string;
    amount: Money;
    note?: string;
    expiresInHours?: number;
    payeeName?: string;
    payeeEmail?: string;
    splitId?: string;
  }): Promise<NewPaymentRequest> {
    const DEFAULT_HOURS = 72;
    const MS_PER_HOUR = 3_600_000;
    const now = this.clock.now();

    return {
      userId: draft.userId,
      requesterName: 'Amara Nwosu',
      payeeName: draft.payeeName ?? null,
      payeeEmail: draft.payeeEmail ?? null,
      amount: toStored(draft.amount),
      note: draft.note ?? null,
      token: `tok-${now.getTime()}-${Math.trunc(Number(draft.amount.amount))}-${draft.payeeName ?? ''}`,
      destinationAccountId: draft.destinationAccountId,
      splitId: draft.splitId ?? null,
      expiresAt: new Date(now.getTime() + (draft.expiresInHours ?? DEFAULT_HOURS) * MS_PER_HOUR),
      createdAt: now,
    };
  }

  asFactory(): PaymentRequestFactory {
    return this as unknown as PaymentRequestFactory;
  }
}

/** A notifier that records what it was asked to announce. */
export class RecordingNotifier extends PaymentRequestNotifierPort {
  readonly events: Array<{ event: RequestEvent; id: string }> = [];

  override async announce(event: RequestEvent, request: PaymentRequestRecord): Promise<void> {
    this.events.push({ event, id: request.id });
  }
}

/** A poster that records the settlements it was asked to book. */
export class RecordingRequestPoster {
  readonly settled: string[] = [];

  constructor(private readonly clock: ClockService) {}

  now(): Date {
    return this.clock.now();
  }

  async settle(input: { request: { id: string } }): Promise<string> {
    this.settled.push(input.request.id);
    return `jnl_${input.request.id}`;
  }

  asPoster(): PaymentRequestPoster {
    return this as unknown as PaymentRequestPoster;
  }
}

/** An account service that owns two accounts and refuses everything else. */
export class StubAccounts {
  async requireOwned(reference: OwnedAccountRef): Promise<AccountRecord> {
    const { accountId, userId } = reference;
    const owner = accountId === DESTINATION ? REQUESTER : PAYER;
    if (owner !== userId) {
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
