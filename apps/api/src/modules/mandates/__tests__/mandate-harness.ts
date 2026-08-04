import { type ClientSession } from 'mongoose';

import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import {
  type AccountRecord,
  type AccountService,
  type OwnedAccountRef,
} from '../../accounts/index.js';
import { InMemoryMandateStore } from '../in-memory-mandate.store.js';
import { MandateFrequency } from '../mandate.constants.js';
import { type MandatePoster } from '../mandate.poster.js';
import { type NewMandate } from '../mandate.store.js';

/** A session stand-in. The in-memory store ignores it, as the real one would use it. */
export const NO_SESSION = null as unknown as ClientSession;

export const CUSTOMER = 'usr_01JQ8Z0000000000000000000A';
export const ACCOUNT = 'acc_01JQ8Z0000000000000000000A';

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

export function frozenClock(iso = '2026-03-02T09:00:00.000Z'): ClockService {
  const clock = new ClockService();
  clock.freezeAt(new Date(iso));
  return clock;
}

export function mandateStore(): InMemoryMandateStore {
  return new InMemoryMandateStore(new IdGenerator());
}

/**
 * A poster that records what it booked and refuses when the account is empty.
 *
 * The funds check is the real service's responsibility in production; reproducing a refusal
 * here is what lets the sweep's "one failure does not stop the others" behaviour be tested.
 */
export class RecordingMandatePoster {
  readonly booked: string[] = [];
  private solvent = true;
  private counter = 0;

  constructor(private readonly clock: ClockService) {}

  broke(): this {
    this.solvent = false;
    return this;
  }

  now(): Date {
    return this.clock.now();
  }

  async collect(input: { mandate: { id: string } }): Promise<{
    journalEntryId: string;
    settlementEntryId: string;
    transactionId: string | null;
  }> {
    if (!this.solvent) {
      throw new AppError({
        code: 'INSUFFICIENT_FUNDS',
        message: 'The available balance is too low to cover this Direct Debit.',
      });
    }

    this.counter += 1;
    this.booked.push(`collect:${input.mandate.id}`);

    return {
      journalEntryId: `jnl_collect_${this.counter}`,
      settlementEntryId: `jnl_settle_${this.counter}`,
      transactionId: `txn_${this.counter}`,
    };
  }

  async refund(input: { collectionEntryId: string }): Promise<string> {
    this.booked.push(`refund:${input.collectionEntryId}`);
    return `jnl_refund_${input.collectionEntryId}`;
  }

  asPoster(): MandatePoster {
    return this as unknown as MandatePoster;
  }
}

/** An account service that owns exactly one usable account. */
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

/** A £42.50 monthly gym membership, capped at £60. */
export function mandateDraft(now: Date, overrides: Partial<NewMandate> = {}): NewMandate {
  return {
    userId: CUSTOMER,
    merchantName: 'Meridian Fitness',
    merchantLogoUrl: null,
    accountId: ACCOUNT,
    reference: 'MF-4471902',
    fixedAmount: toStored(Money.fromMajor('42.50', 'GBP')),
    maxAmount: toStored(Money.fromMajor('60.00', 'GBP')),
    frequency: MandateFrequency.MONTHLY,
    nextExpectedAt: now,
    createdAt: now,
    ...overrides,
  };
}
