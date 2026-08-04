import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import {
  IdempotencyKeyDocument,
  IdempotencyStatus,
  type IdempotencyKeyDoc,
} from './idempotency-key.schema.js';
import { DUPLICATE_KEY_ERROR_CODE } from './idempotency.constants.js';

/** Identifies one claim. Always both fields — a key is only unique within its caller. */
export interface KeyScope {
  readonly key: string;
  readonly userId: string;
}

/** Storage for idempotency claims. */
@Injectable()
export class IdempotencyKeyRepository {
  constructor(
    @InjectModel(IdempotencyKeyDocument.name)
    private readonly model: Model<IdempotencyKeyDocument>,
  ) {}

  /**
   * Attempts to claim the key with a single insert.
   *
   * Returns `false` when the unique index rejected the insert, meaning another request
   * already owns the claim. **Do not** replace this with a find-then-insert: between the
   * find and the insert two concurrent requests both see nothing and both proceed, which
   * is precisely the double-spend this whole module exists to prevent. The index is the
   * only thing in the system that can adjudicate that race atomically.
   */
  async claim(input: KeyScope & { requestHash: string }): Promise<boolean> {
    try {
      await this.model.create({
        key: input.key,
        userId: input.userId,
        requestHash: input.requestHash,
        status: IdempotencyStatus.IN_FLIGHT,
        responseStatus: null,
        responseBody: null,
        completedAt: null,
      });
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async find(scope: KeyScope): Promise<IdempotencyKeyDoc | null> {
    return this.model.findOne({ key: scope.key, userId: scope.userId }).exec();
  }

  /** Stores the handler's answer and flips the claim to COMPLETED. */
  async complete(
    input: KeyScope & { responseStatus: number; responseBody: unknown; completedAt: Date },
  ): Promise<void> {
    await this.model
      .updateOne(
        { key: input.key, userId: input.userId },
        {
          $set: {
            status: IdempotencyStatus.COMPLETED,
            responseStatus: input.responseStatus,
            responseBody: input.responseBody,
            completedAt: input.completedAt,
          },
        },
      )
      .exec();
  }

  /**
   * Drops an in-flight claim so the client may legitimately retry.
   *
   * Scoped to `IN_FLIGHT` so a late release cannot delete a completed claim and, with it,
   * the stored response a concurrent replay is about to read.
   */
  async release(scope: KeyScope): Promise<void> {
    await this.model
      .deleteOne({ key: scope.key, userId: scope.userId, status: IdempotencyStatus.IN_FLIGHT })
      .exec();
  }
}

/** MongoDB reports every unique-index violation as error 11000, whichever index it was. */
export function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR_CODE
  );
}
