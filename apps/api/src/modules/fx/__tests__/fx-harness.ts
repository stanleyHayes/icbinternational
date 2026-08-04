import { type ClientSession } from 'mongoose';

import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type TransactionRunner } from '../../../database/transaction.runner.js';
import { type BalanceService } from '../../holds/index.js';
import { type FxConversionPoster } from '../fx-conversion.poster.js';
import { type NewFxQuote } from '../fx-quote.store.js';
import { InMemoryFxQuoteStore } from '../in-memory-fx-quote.store.js';

/**
 * Stand-ins for the collaborators whose own correctness belongs to another lane.
 *
 * Each is as thin as it can be while staying honest about the contract the execution path
 * relies on: the runner really does hand a session to the callback and really does propagate
 * a throw, and the balance stub really does refuse. A stub that always said yes would make
 * the tests that matter pass for the wrong reason.
 */

/** A session stand-in. Nothing in these tests reads it; the stores ignore it. */
export const NO_SESSION = null as unknown as ClientSession;

/**
 * A runner that executes the callback and lets a throw escape.
 *
 * Rolling back is MongoDB's job; what the execution path must prove is that it *throws*
 * when the claim fails, because that is what causes the roll-back in production.
 */
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

/** A poster that records what it was asked to book, and mints plausible ids. */
export class RecordingConversionPoster {
  readonly posted: string[] = [];
  private counter = 0;

  constructor(private readonly clock: ClockService) {}

  now(): Date {
    return this.clock.now();
  }

  async post(quote: { id: string }): Promise<{
    conversionId: string;
    entryId: string;
    at: Date;
  }> {
    this.counter += 1;
    this.posted.push(quote.id);

    return {
      conversionId: `trf_${String(this.counter).padStart(26, '0')}`,
      entryId: `jnl_${String(this.counter).padStart(26, '0')}`,
      at: this.clock.now(),
    };
  }

  /** Typed as the real collaborator, so the service under test is wired exactly as in production. */
  asPoster(): FxConversionPoster {
    return this as unknown as FxConversionPoster;
  }
}

/** A balance service that refuses once the configured floor is crossed. */
export class StubBalances {
  readonly checked: string[] = [];

  constructor(private available: Money = Money.fromMajor('10,000.00', 'GBP')) {}

  broke(): this {
    this.available = Money.zero(this.available.currency);
    return this;
  }

  async assertSufficientFunds(accountId: string, amount: Money): Promise<void> {
    this.checked.push(accountId);
    if (amount.greaterThan(this.available)) {
      throw new AppError({
        code: 'INSUFFICIENT_FUNDS',
        message: 'The available balance is too low to complete this exchange.',
      });
    }
  }

  asService(): BalanceService {
    return this as unknown as BalanceService;
  }
}

/** A live quote for £500 into euros, expiring ninety seconds from `now`. */
export function quoteDraft(now: Date, overrides: Partial<NewFxQuote> = {}): NewFxQuote {
  const SECONDS = 90;
  const MS = 1000;

  return {
    userId: 'usr_01JQ8Z0000000000000000000A',
    from: 'GBP',
    to: 'EUR',
    fromAccountId: 'acc_01JQ8Z0000000000000000000A',
    toAccountId: 'acc_01JQ8Z0000000000000000000B',
    sellAmount: toStored(Money.fromMajor('500.00', 'GBP')),
    buyAmount: toStored(Money.fromMajor('582.50', 'EUR')),
    rate: '1.16500000',
    midRate: '1.16850000',
    spreadBps: 30,
    spreadCost: toStored(Money.fromMajor('1.75', 'EUR')),
    fee: toStored(Money.zero('GBP')),
    expiresAt: new Date(now.getTime() + SECONDS * MS),
    createdAt: now,
    ...overrides,
  };
}

/** A clock pinned to a known instant, so expiry is asserted rather than raced. */
export function frozenClock(iso = '2026-03-02T09:00:00.000Z'): ClockService {
  const clock = new ClockService();
  clock.freezeAt(new Date(iso));
  return clock;
}

/** A quote store seeded with nothing, sharing the id generator the services use. */
export function quoteStore(): InMemoryFxQuoteStore {
  return new InMemoryFxQuoteStore(new IdGenerator());
}
