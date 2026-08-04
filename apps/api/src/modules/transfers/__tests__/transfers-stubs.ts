import { type ClientSession } from 'mongoose';

import { type Product } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { productFixture } from '../../accounts/__tests__/accounts-harness.js';
import { type JournalEntryRecord } from '../../ledger/repositories/journal-entry.store.js';
import {
  computeFee,
  findFeeEntry,
  FeeWaiver,
  type FeeQuote,
  type FeeRequest,
} from '../../products/index.js';
import { StepUpPort, stepUpRequired } from '../ports/step-up.port.js';

/**
 * Stand-ins for the three collaborators whose own correctness belongs to another lane.
 *
 * Each one is as thin as it can be while staying *honest* about the contract the transfer
 * path relies on: the fee stub runs the real `computeFee` arithmetic against a real
 * product, the limits stub actually accumulates and actually refuses, and the step-up stub
 * refuses a missing or mismatched token exactly as the JWT verifier does. A stub that
 * always said yes would make the tests that matter pass for the wrong reason.
 */

/** A product catalogue of exactly one version, pinned for every account in a rig. */
export class StubProductService {
  constructor(private readonly product: Product = productFixture()) {}

  /** Mirrors `ProductService.getVersion`: the terms the account was opened on. */
  async getVersion(): Promise<Product> {
    return this.product;
  }
}

/**
 * `FeeService` over the real fee arithmetic, with an in-memory allowance counter.
 *
 * `charged` records every event that consumed an allowance, so a test can prove the fee was
 * charged inside the payment's transaction rather than merely quoted.
 */
export class StubFeeService {
  readonly charged: string[] = [];
  private readonly used = new Map<string, number>();

  async quote(request: FeeRequest): Promise<FeeQuote> {
    const entry = findFeeEntry(request.product, request.kind);
    if (!entry) {
      return {
        kind: request.kind,
        label: request.kind,
        fee: Money.zero(request.amount.currency),
        waivedBy: FeeWaiver.NOT_PRICED,
        freeRemaining: 0,
      };
    }

    return computeFee({
      entry,
      amount: request.amount,
      usedThisMonth: this.used.get(this.key(request)) ?? 0,
      tier: request.tier ?? null,
    });
  }

  async charge(request: FeeRequest): Promise<FeeQuote> {
    const quote = await this.quote(request);
    if (quote.waivedBy !== FeeWaiver.NOT_PRICED) {
      this.used.set(this.key(request), (this.used.get(this.key(request)) ?? 0) + 1);
      this.charged.push(this.key(request));
    }
    return quote;
  }

  private key(request: FeeRequest): string {
    return `${request.accountId}:${request.kind}`;
  }
}

/**
 * `LimitsService` reduced to the two calls the transfer path makes.
 *
 * It genuinely accumulates and genuinely refuses once `cap` is passed, so the "limits are
 * consumed inside the transaction" and "an exhausted limit refuses the payment" tests are
 * testing behaviour rather than a mock's return value.
 */
export class StubLimitsService {
  readonly recorded: Array<{ accountId: string; amount: string }> = [];
  private readonly totals = new Map<string, bigint>();
  private cap: Money | null = null;

  /** Caps the daily allowance for every account in the rig. */
  capAt(limit: Money): this {
    this.cap = limit;
    return this;
  }

  async check(query: { accountId: string }, amount: Money): Promise<void> {
    if (!this.cap) return;

    const used = this.totals.get(query.accountId) ?? 0n;
    const after = Money.fromMinor(used + amount.amount, amount.currency);
    if (after.greaterThan(this.cap)) throw limitExceeded();
  }

  async record(query: { accountId: string }, amount: Money): Promise<void> {
    this.totals.set(query.accountId, (this.totals.get(query.accountId) ?? 0n) + amount.amount);
    this.recorded.push({ accountId: query.accountId, amount: amount.amount.toString() });
  }
}

/** The contract error `LimitsService` raises, so the transfer path sees the real code. */
function limitExceeded(): Error & { code: string } {
  return Object.assign(new Error('This exceeds your transfer limit.'), {
    code: 'LIMIT_EXCEEDED',
  });
}

/**
 * A projector that records what it was handed.
 *
 * The transactions lane owns whether a row is projected correctly; what this lane must
 * prove is that it calls the projector *inside the posting session*, so the statement line
 * and the money commit together.
 */
export class RecordingProjector {
  readonly projected: Array<{ entryId: string; hadSession: boolean }> = [];

  async project(entry: JournalEntryRecord, session?: ClientSession): Promise<[]> {
    this.projected.push({ entryId: entry.id, hadSession: session !== undefined });
    return [];
  }
}

/** A step-up verifier that accepts exactly one token, for exactly one customer. */
export class RecordingStepUp extends StepUpPort {
  readonly calls: Array<string | undefined> = [];
  private accepted: { userId: string; token: string } | null = null;

  /** Registers the one proof this verifier will accept. */
  accept(userId: string, token: string): this {
    this.accepted = { userId, token };
    return this;
  }

  override async assertSatisfied(userId: string, token: string | undefined): Promise<void> {
    this.calls.push(token);
    if (!token) throw stepUpRequired('no step-up proof was presented');
    if (this.accepted?.userId !== userId || this.accepted.token !== token) {
      throw stepUpRequired('the step-up proof was rejected');
    }
  }
}
