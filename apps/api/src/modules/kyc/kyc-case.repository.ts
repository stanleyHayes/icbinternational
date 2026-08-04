/**
 * Persistence for the `kyc_cases` collection.
 *
 * Also the audit subject loader for the lane: the `@Audited()` interceptor asks it for
 * the before/after snapshots, and the answer deliberately drops the sealed PII blob —
 * ciphertext is not sensitive, but it is also not informative, and the allow-list in
 * `kyc.constants.ts` is the second line of defence, not the first.
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type UpdateQuery } from 'mongoose';

import { KycStatus, type KycStatus as KycStatusType } from '@reliance/contracts';

import { BaseRepository } from '../../database/base.repository.js';
import { type AuditSubjectLoader } from '../audit/index.js';

import { KycCaseRecord, type KycCaseDocument } from './kyc-case.schema.js';

/** A page request against the analyst review queue. */
export interface ReviewQueueQuery {
  readonly statuses: readonly KycStatusType[];
  /** Only cases submitted after this instant (exclusive cursor anchor). */
  readonly submittedAfter?: Date;
  readonly limit: number;
}

@Injectable()
export class KycCaseRepository extends BaseRepository<KycCaseRecord> implements AuditSubjectLoader {
  constructor(@InjectModel(KycCaseRecord.name) model: Model<KycCaseRecord>) {
    super(model);
  }

  /** Opens the case's first version. The unique `userId` index rejects duplicates. */
  async insertCase(data: Record<string, unknown>): Promise<KycCaseDocument> {
    return (await this.create(data)) as KycCaseDocument;
  }

  /** The customer's single case, or null when onboarding has never started. */
  async findByUser(userId: string, session?: ClientSession): Promise<KycCaseDocument | null> {
    return this.findOne({ userId }, session) as Promise<KycCaseDocument | null>;
  }

  /** A case by public id, or null. */
  async findByCaseId(id: string, session?: ClientSession): Promise<KycCaseDocument | null> {
    return this.findById(id, session) as Promise<KycCaseDocument | null>;
  }

  /** Applies an update and returns the new document. */
  async patch(
    id: string,
    update: UpdateQuery<KycCaseRecord>,
    session?: ClientSession,
  ): Promise<KycCaseDocument | null> {
    return this.updateById(id, update, session) as Promise<KycCaseDocument | null>;
  }

  /** The analyst queue, oldest submission first. */
  async findReviewQueue(query: ReviewQueueQuery): Promise<KycCaseDocument[]> {
    const filter: Record<string, unknown> = { status: { $in: [...query.statuses] } };
    if (query.submittedAfter) filter.submittedAt = { $gt: query.submittedAfter };
    return this.find(filter, {
      sort: { submittedAt: 1, id: 1 },
      limit: query.limit,
    }) as Promise<KycCaseDocument[]>;
  }

  /** Approved cases whose re-KYC validity has lapsed as of `now`. */
  async findExpiredApproved(now: Date, limit: number): Promise<KycCaseDocument[]> {
    return this.find(
      { status: KycStatus.APPROVED, expiresAt: { $lte: now } },
      { sort: { expiresAt: 1 }, limit },
    ) as Promise<KycCaseDocument[]>;
  }

  /** The audit snapshot, with the sealed PII blob removed before recording. */
  async loadAuditSubject(entityId: string): Promise<Record<string, unknown> | null> {
    const found = await this.findByCaseId(entityId);
    if (!found) return null;
    const snapshot = found.toObject() as unknown as Record<string, unknown>;
    delete snapshot.pii;
    return snapshot;
  }
}
