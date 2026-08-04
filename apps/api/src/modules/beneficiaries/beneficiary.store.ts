import { type ClientSession } from 'mongoose';

import { type NameCheckResult, type TransferDestination } from '@reliance/contracts';

/**
 * What a service is allowed to know about payee persistence.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token. The in-memory twin enforces the same uniqueness and the same
 * owner-scoped reads, which is what lets the cooling-off rule — the part of this lane that
 * can actually stop a customer's money — be tested exhaustively without a replica set.
 */
export abstract class BeneficiaryStore {
  /**
   * Writes a new payee and mints its public `ben_` id.
   *
   * Returns the existing record instead of failing when the customer already has this
   * destination saved. Re-adding a payee you already have is not an error the customer
   * can act on, and — this is the part that matters — a fresh record would restart the
   * cooling-off clock, so "add, cancel, add again" would be a way to *shorten* nothing
   * while "delete and re-add" is the honest way to restart it.
   */
  abstract insert(beneficiary: NewBeneficiary, session?: ClientSession): Promise<BeneficiaryRecord>;

  abstract findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<BeneficiaryRecord | null>;

  /** The customer's saved payees, favourites first and then newest first. */
  abstract listByUser(query: BeneficiaryQuery): Promise<BeneficiaryRecord[]>;

  /**
   * The customer's payee matching any of `keys`, or null.
   *
   * Takes a set rather than one key because a destination is recognisable several ways —
   * see `destination-key.ts` — and a transfer that resolved an email to an account must be
   * able to find the payee saved under either.
   */
  abstract findByKeys(
    userId: string,
    keys: readonly string[],
    session?: ClientSession,
  ): Promise<BeneficiaryRecord | null>;

  abstract count(userId: string, session?: ClientSession): Promise<number>;

  /** Applies an owner-scoped patch. Returns null when the payee is not this customer's. */
  abstract patch(input: BeneficiaryPatchInput): Promise<BeneficiaryRecord | null>;

  /** Stamps the payee as used. Best-effort ordering data, never a correctness input. */
  abstract touch(input: TouchBeneficiaryInput): Promise<void>;

  abstract remove(id: string, userId: string, session?: ClientSession): Promise<boolean>;
}

/** A persisted payee as services see it — a plain value, with no `.save()` on it. */
export interface BeneficiaryRecord {
  readonly id: string;
  readonly userId: string;
  readonly nickname: string;
  readonly destination: TransferDestination;
  /** Every canonical key this destination answers to. Indexed; used for payee matching. */
  readonly matchKeys: readonly string[];
  readonly currency: string;
  readonly nameCheck: NameCheckResult;
  readonly nameCheckSuggestion: string | null;
  readonly isFavourite: boolean;
  /** When the cooling-off window closes. Never null on a saved payee. */
  readonly trustedFrom: Date;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
}

/** A payee on its way in: no id yet and never used. */
export type NewBeneficiary = Omit<BeneficiaryRecord, 'id' | 'lastUsedAt'>;

export interface BeneficiaryQuery {
  readonly userId: string;
  readonly favouritesOnly?: boolean;
  readonly session?: ClientSession;
}

/** The fields a customer may change about a saved payee. The destination is not one. */
export interface BeneficiaryPatchFields {
  readonly nickname?: string;
  readonly isFavourite?: boolean;
}

export interface BeneficiaryPatchInput {
  readonly id: string;
  readonly userId: string;
  readonly fields: BeneficiaryPatchFields;
  readonly session?: ClientSession;
}

export interface TouchBeneficiaryInput {
  readonly id: string;
  readonly usedAt: Date;
  readonly session?: ClientSession;
}
