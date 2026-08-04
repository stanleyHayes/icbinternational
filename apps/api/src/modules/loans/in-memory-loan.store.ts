/**
 * An honest, in-memory `LoanStore`.
 *
 * The rules that matter are reproduced exactly. {@link listForArrearsSweep} returns only
 * live loans that have not already been visited on the business date, so a test can prove
 * the sweep charges one late fee per missed instalment however many times the day is
 * processed — a fake that ignored `lastArrearsRunOn` would let the idempotency tests pass
 * while the production path double-charged.
 *
 * Shipped in `src` beside its abstraction, as the holds module's fake is, so the two
 * cannot drift apart unnoticed.
 */

import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  LoanStore,
  type ArrearsSweepQuery,
  type ConditionalLoanPatch,
  type LoanPatchFields,
  type LoanQuery,
  type LoanRecord,
  type NewLoan,
} from './loan.store.js';
import { LoanStatus } from './loan.types.js';

/** Loans that are still being serviced, and therefore still able to fall behind. */
const LIVE_STATUSES: ReadonlySet<LoanStatus> = new Set([
  LoanStatus.ACTIVE,
  LoanStatus.IN_ARREARS,
  LoanStatus.RESTRUCTURED,
]);

@Injectable()
export class InMemoryLoanStore extends LoanStore {
  private readonly byId = new Map<string, LoanRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(loan: NewLoan): Promise<LoanRecord> {
    const record: LoanRecord = { ...loan, id: this.ids.generate('loan') };
    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string): Promise<LoanRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async list(query: LoanQuery): Promise<LoanRecord[]> {
    return [...this.byId.values()]
      .filter((loan) => (query.userId ? loan.userId === query.userId : true))
      .filter((loan) => (query.status ? loan.status === query.status : true))
      .sort((left, right) => right.disbursedAt.getTime() - left.disbursedAt.getTime());
  }

  override async patch(id: string, fields: LoanPatchFields): Promise<LoanRecord | null> {
    const current = this.byId.get(id);
    if (!current) return null;

    const updated: LoanRecord = { ...current, ...definedOnly(fields) };
    this.byId.set(id, updated);
    return updated;
  }

  /**
   * Read and write with no `await` between them, exactly as `findOneAndUpdate` behaves.
   *
   * This is the whole reason the fake is worth having. An implementation that awaited the
   * lookup and *then* wrote would let two concurrent repayments both observe the same
   * `repaymentCount` and both commit — the interleaving MongoDB's atomic read-modify-write
   * exists to prevent, and the exact shape of the defect this guard was added for. A fake
   * with that gap would make the concurrency test pass while the property went untested.
   */
  override async patchIf(input: ConditionalLoanPatch): Promise<LoanRecord | null> {
    const current = this.byId.get(input.id);
    if (!current || current.repaymentCount !== input.expect.repaymentCount) return null;

    const updated: LoanRecord = { ...current, ...definedOnly(input.fields) };
    this.byId.set(input.id, updated);
    return updated;
  }

  override async listForArrearsSweep(query: ArrearsSweepQuery): Promise<LoanRecord[]> {
    return [...this.byId.values()]
      .filter((loan) => LIVE_STATUSES.has(loan.status))
      .filter((loan) => loan.lastArrearsRunOn !== query.asOf)
      .sort((left, right) => left.disbursedAt.getTime() - right.disbursedAt.getTime())
      .slice(0, query.limit);
  }

  /** Every stored loan, for assertions. */
  all(): LoanRecord[] {
    return [...this.byId.values()];
  }
}

/**
 * Drops keys the caller left out.
 *
 * A patch names the fields it changes. Spreading the object wholesale would write
 * `undefined` over everything the caller did not mention, which in a document store is
 * indistinguishable from deliberately clearing it.
 */
function definedOnly(fields: LoanPatchFields): Partial<LoanRecord> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<LoanRecord>;
}
