/**
 * An honest, in-memory `LoanApplicationStore`.
 *
 * {@link listExpiredOffers} returns only applications that are actually sitting on a live
 * offer, so the expiry sweep cannot resurrect an application that was declined or
 * withdrawn while its offer date happened to pass.
 */

import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  LoanApplicationStore,
  type ApplicationClaim,
  type ExpiredOfferQuery,
  type LoanApplicationPatchFields,
  type LoanApplicationQuery,
  type LoanApplicationRecord,
  type NewLoanApplication,
} from './loan-application.store.js';
import { LoanApplicationStatus } from './loan.types.js';

@Injectable()
export class InMemoryLoanApplicationStore extends LoanApplicationStore {
  private readonly byId = new Map<string, LoanApplicationRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(application: NewLoanApplication): Promise<LoanApplicationRecord> {
    const record: LoanApplicationRecord = { ...application, id: this.ids.generate('quote') };
    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string): Promise<LoanApplicationRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async list(query: LoanApplicationQuery): Promise<LoanApplicationRecord[]> {
    return [...this.byId.values()]
      .filter((application) => (query.userId ? application.userId === query.userId : true))
      .filter((application) => (query.status ? application.status === query.status : true))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  override async patch(
    id: string,
    fields: LoanApplicationPatchFields,
  ): Promise<LoanApplicationRecord | null> {
    const current = this.byId.get(id);
    if (!current) return null;

    const updated: LoanApplicationRecord = { ...current, ...definedOnly(fields) };
    this.byId.set(id, updated);
    return updated;
  }

  /**
   * Read and write with no `await` between them, exactly as `findOneAndUpdate` behaves.
   *
   * A fake that awaited the lookup first would let two concurrent acceptances of one offer
   * both see `OFFER_MADE` and both claim it — which is precisely the double-disbursement
   * this method exists to make impossible.
   */
  override async claim(input: ApplicationClaim): Promise<LoanApplicationRecord | null> {
    const current = this.byId.get(input.id);
    if (!current || current.status !== input.from) return null;

    const updated: LoanApplicationRecord = { ...current, ...definedOnly(input.fields) };
    this.byId.set(input.id, updated);
    return updated;
  }

  override async listExpiredOffers(query: ExpiredOfferQuery): Promise<LoanApplicationRecord[]> {
    return [...this.byId.values()]
      .filter((application) => application.status === LoanApplicationStatus.OFFER_MADE)
      .filter(
        (application) =>
          application.offerExpiresAt !== null &&
          application.offerExpiresAt.getTime() <= query.asOf.getTime(),
      )
      .slice(0, query.limit);
  }

  /** Every stored application, for assertions. */
  all(): LoanApplicationRecord[] {
    return [...this.byId.values()];
  }
}

/** Drops keys the caller left out, so a patch never clears a field by omission. */
function definedOnly(fields: LoanApplicationPatchFields): Partial<LoanApplicationRecord> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<LoanApplicationRecord>;
}
