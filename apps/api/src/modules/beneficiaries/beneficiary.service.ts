import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  ErrorCode,
  type Beneficiary,
  type CreateBeneficiaryRequest,
  type TransferDestination,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { type UpdateBeneficiaryRequest } from './beneficiaries.dto.js';
import { COOLING_OFF_HOURS, MAX_BENEFICIARIES_PER_CUSTOMER } from './beneficiary.constants.js';
import { toContractBeneficiary } from './beneficiary.mapper.js';
import { BeneficiaryStore, type BeneficiaryRecord } from './beneficiary.store.js';
import { destinationKeys } from './destination-key.js';
import { checkPayeeName, type NameCheckVerdict } from './name-check.js';
import { PayeeNamePort } from './ports/payee-name.port.js';

/**
 * Saved payees: the address book a customer pays from.
 *
 * Two properties hold this together.
 *
 * **The cooling-off clock starts once.** `trustedFrom` is computed at creation and the
 * schema marks it immutable, so nothing — a rename, a favourite, a retry, a duplicate
 * save — can move it. Re-saving a payee you already have returns the incumbent record for
 * the same reason: a fresh row would reset the clock, and a rule a customer can reset by
 * tapping twice is not a rule.
 *
 * **A name check is stored, not recomputed.** What matters in a complaint is what the
 * customer was shown at the moment they chose to save the payee, so the verdict is
 * persisted alongside the destination rather than re-derived later against a directory
 * that may since have changed.
 */
@Injectable()
export class BeneficiaryService {
  private readonly logger = new Logger(BeneficiaryService.name);

  constructor(
    private readonly store: BeneficiaryStore,
    private readonly names: PayeeNamePort,
    private readonly clock: ClockService,
  ) {}

  async list(userId: string, favouritesOnly = false): Promise<Beneficiary[]> {
    const records = await this.store.listByUser({ userId, favouritesOnly });
    return records.map((record) => toContractBeneficiary(record));
  }

  async get(userId: string, beneficiaryId: string): Promise<Beneficiary> {
    return toContractBeneficiary(await this.require(userId, beneficiaryId));
  }

  /**
   * Saves a payee, running the name check as it goes.
   *
   * @param input.extraKeys Additional canonical keys the destination answers to, supplied
   *   by a caller that has already resolved it — the transfer path knows the account an
   *   email points at, and adding that key is what lets a later payment by account number
   *   recognise the same payee.
   */
  async create(input: {
    userId: string;
    request: CreateBeneficiaryRequest;
    extraKeys?: readonly string[];
    session?: ClientSession;
  }): Promise<BeneficiaryRecord> {
    await this.assertRoomFor(input.userId, input.session);

    const verdict = await this.verify(input.request.destination, nicknameAsName(input.request));

    const record = await this.store.insert(
      {
        userId: input.userId,
        nickname: input.request.nickname,
        destination: input.request.destination,
        matchKeys: uniqueKeys(input.request.destination, input.extraKeys),
        currency: input.request.currency,
        nameCheck: verdict.result,
        nameCheckSuggestion: verdict.suggestion,
        isFavourite: input.request.isFavourite,
        trustedFrom: this.clock.inHours(COOLING_OFF_HOURS),
        createdAt: this.clock.now(),
      },
      input.session,
    );

    this.logger.log(`Saved payee ${record.id} for ${input.userId} (${verdict.result})`);
    return record;
  }

  /** Renames a payee or moves it in and out of favourites. */
  async update(
    userId: string,
    beneficiaryId: string,
    request: UpdateBeneficiaryRequest,
  ): Promise<Beneficiary> {
    const updated = await this.store.patch({ id: beneficiaryId, userId, fields: request });
    if (!updated) throw beneficiaryNotFound(beneficiaryId);
    return toContractBeneficiary(updated);
  }

  /**
   * Forgets a payee.
   *
   * Deleting genuinely deletes rather than soft-deleting, and that is the customer-facing
   * choice: "remove payee" that leaves the row behind means re-adding them keeps the old
   * cooling-off status, so a payee the customer deleted because something felt wrong would
   * come back already trusted.
   */
  async remove(userId: string, beneficiaryId: string): Promise<void> {
    const removed = await this.store.remove(beneficiaryId, userId);
    if (!removed) throw beneficiaryNotFound(beneficiaryId);
  }

  /** Confirmation of Payee for a destination the customer has not saved yet. */
  async verify(
    destination: TransferDestination,
    claimedName: string,
    session?: ClientSession,
  ): Promise<NameCheckVerdict> {
    const registered = await this.names.nameFor(destination, session);
    return checkPayeeName(claimedName, registered);
  }

  /** The payee this destination belongs to, or null when it has never been saved. */
  async findMatching(input: {
    userId: string;
    keys: readonly string[];
    session?: ClientSession;
  }): Promise<BeneficiaryRecord | null> {
    return this.store.findByKeys(input.userId, input.keys, input.session);
  }

  /** Records that a payee was paid, for list ordering. Never a correctness input. */
  async markUsed(beneficiaryId: string, session?: ClientSession): Promise<void> {
    await this.store.touch({ id: beneficiaryId, usedAt: this.clock.now(), session });
  }

  /** The payee, or `BENEFICIARY_NOT_FOUND` if it is missing *or* not this customer's. */
  async require(
    userId: string,
    beneficiaryId: string,
    session?: ClientSession,
  ): Promise<BeneficiaryRecord> {
    const record = await this.store.findById(beneficiaryId, userId, session);
    if (!record) throw beneficiaryNotFound(beneficiaryId);
    return record;
  }

  private async assertRoomFor(userId: string, session?: ClientSession): Promise<void> {
    const saved = await this.store.count(userId, session);
    if (saved < MAX_BENEFICIARIES_PER_CUSTOMER) return;

    throw new AppError({
      code: ErrorCode.ACCOUNT_LIMIT_REACHED,
      message: `You can save up to ${MAX_BENEFICIARIES_PER_CUSTOMER} payees. Remove one to add another.`,
      context: { userId, saved },
    });
  }
}

/**
 * The single "no such payee" rejection.
 *
 * A payee that is missing and a payee that belongs to somebody else answer identically, so
 * that walking `ben_` ids reveals nothing about which of them exist.
 */
export function beneficiaryNotFound(beneficiaryId: string): AppError {
  return new AppError({
    code: ErrorCode.BENEFICIARY_NOT_FOUND,
    message: 'No such payee.',
    context: { beneficiaryId },
  });
}

/**
 * The name to check against, taken from the destination where the rail supplies one.
 *
 * Domestic and international destinations carry the payee's real name; an internal one
 * carries only identifiers, so the nickname is the only name the customer has typed and it
 * is what gets checked. A nickname of "Mum" against "Alice Okafor" is a `NO_MATCH`, which
 * is the honest answer — the customer is told the name does not match and can decide.
 */
function nicknameAsName(request: CreateBeneficiaryRequest): string {
  const { destination } = request;
  return destination.kind === 'INTERNAL' ? request.nickname : destination.accountName;
}

/** The destination's own keys plus any the caller resolved, de-duplicated. */
function uniqueKeys(
  destination: TransferDestination,
  extraKeys: readonly string[] | undefined,
): string[] {
  return [...new Set([...destinationKeys(destination), ...(extraKeys ?? [])])];
}
