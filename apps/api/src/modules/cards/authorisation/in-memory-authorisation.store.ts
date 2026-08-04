import { Injectable } from '@nestjs/common';

import { AuthorisationStatus } from '@reliance/contracts';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { decodeCursor } from '../../../common/pagination/cursor.js';

import {
  AuthorisationStore,
  type AuthorisationPatchInput,
  type AuthorisationQuery,
  type AuthorisationRecord,
  type ClearedQuery,
  type NewAuthorisation,
  type SpendWindowQuery,
} from './authorisation.store.js';

/** Statuses whose amount has been, or still may be, taken from the customer. */
const COUNTS_TOWARDS_SPEND: readonly AuthorisationStatus[] = [
  AuthorisationStatus.APPROVED,
  AuthorisationStatus.CAPTURED,
];

/**
 * An honest, in-memory `AuthorisationStore`.
 *
 * {@link patch} honours the expected-status guard exactly as the repository does, which
 * is what lets the double-capture and capture-versus-reversal races be proven without a
 * replica set. A fake that patched unconditionally would make those tests green while the
 * production path could still release one hold twice.
 */
@Injectable()
export class InMemoryAuthorisationStore extends AuthorisationStore {
  private readonly byId = new Map<string, AuthorisationRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(authorisation: NewAuthorisation): Promise<AuthorisationRecord> {
    const record: AuthorisationRecord = {
      ...authorisation,
      id: this.ids.generate('authorisation'),
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string): Promise<AuthorisationRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async list(query: AuthorisationQuery): Promise<{ records: AuthorisationRecord[] }> {
    const before = query.cursor ? decodeCursor(query.cursor) : null;
    const cutOff = before ? new Date(before.sortValue).getTime() : null;

    const matches = [...this.byId.values()].filter(
      (record) =>
        record.userId === query.userId &&
        (!query.cardId || record.cardId === query.cardId) &&
        (!query.status || record.status === query.status) &&
        (cutOff === null || record.authorisedAt.getTime() < cutOff),
    );

    return { records: newestFirst(matches).slice(0, query.limit + 1) };
  }

  override async patch(input: AuthorisationPatchInput): Promise<AuthorisationRecord | null> {
    const current = this.byId.get(input.authorisationId);
    if (!current) return null;
    if (input.expectedStatuses && !input.expectedStatuses.includes(current.status)) return null;

    const patched: AuthorisationRecord = { ...current, ...input.fields };
    this.byId.set(patched.id, patched);
    return patched;
  }

  override async listInWindow(query: SpendWindowQuery): Promise<AuthorisationRecord[]> {
    return [...this.byId.values()].filter(
      (record) =>
        record.cardId === query.cardId &&
        COUNTS_TOWARDS_SPEND.includes(record.status) &&
        record.authorisedAt.getTime() >= query.from.getTime() &&
        (!query.channel || record.channel === query.channel),
    );
  }

  override async listExpired(query: ClearedQuery): Promise<AuthorisationRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.status === AuthorisationStatus.APPROVED &&
          record.expiresAt.getTime() <= query.asOf.getTime(),
      )
      .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime())
      .slice(0, query.limit);
  }

  override async listCleared(query: ClearedQuery): Promise<AuthorisationRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.status === AuthorisationStatus.CAPTURED &&
          record.settlementBatchId === null &&
          record.clearedAt !== null &&
          record.clearedAt.getTime() <= query.asOf.getTime(),
      )
      .sort((left, right) => clearedTime(left) - clearedTime(right))
      .slice(0, query.limit);
  }

  override async listByCard(cardId: string, limit: number): Promise<AuthorisationRecord[]> {
    return newestFirst([...this.byId.values()].filter((record) => record.cardId === cardId)).slice(
      0,
      limit,
    );
  }

  /** Every stored authorisation, for assertions. */
  all(): AuthorisationRecord[] {
    return [...this.byId.values()];
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.byId.clear();
  }
}

function newestFirst(records: AuthorisationRecord[]): AuthorisationRecord[] {
  return records.sort((left, right) => right.authorisedAt.getTime() - left.authorisedAt.getTime());
}

/** Only reachable for records already filtered to a non-null clearing time. */
function clearedTime(record: AuthorisationRecord): number {
  return record.clearedAt ? record.clearedAt.getTime() : 0;
}
