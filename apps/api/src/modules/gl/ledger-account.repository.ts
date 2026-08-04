import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { type LedgerAccountType } from '@reliance/contracts';

import { BaseRepository } from '../../database/base.repository.js';

import { GL_CHART_ACCOUNT_MODEL } from './gl.constants.js';
import {
  GlChartAccountSchemaClass,
  type GlChartAccountDocument,
} from './schemas/ledger-account.schema.js';

/** Fields supplied when a row enters the chart of accounts. */
export interface NewLedgerAccount {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly isControlAccount: boolean;
}

/** Outcome of an insert guarded by the unique index on `code`. */
export type InsertLedgerAccountResult =
  | { account: GlChartAccountDocument; conflict?: never }
  | { account?: never; conflict: true };

const DUPLICATE_KEY_CODE = 11_000;

/**
 * Persistence for the GL lifecycle view of `chart_of_accounts`.
 *
 * Writes only lifecycle and descriptive fields — never `balances`, which belongs to the
 * ledger module's posting path.
 */
@Injectable()
export class LedgerAccountRepository extends BaseRepository<GlChartAccountSchemaClass> {
  constructor(@InjectModel(GL_CHART_ACCOUNT_MODEL) model: Model<GlChartAccountSchemaClass>) {
    super(model);
  }

  /** The whole chart, ordered by code. The chart is small by design. */
  async listAll(session?: ClientSession): Promise<GlChartAccountDocument[]> {
    return this.find({} as QueryFilter<GlChartAccountSchemaClass>, { session, sort: { code: 1 } });
  }

  /** Every active row, ordered by code — the rows a trial balance reports on. */
  async listActive(session?: ClientSession): Promise<GlChartAccountDocument[]> {
    return this.find({ active: true } as QueryFilter<GlChartAccountSchemaClass>, {
      session,
      sort: { code: 1 },
    });
  }

  /** Looks a row up by its business key. Returns null rather than throwing. */
  async findByCode(code: string, session?: ClientSession): Promise<GlChartAccountDocument | null> {
    return this.findOne({ code } as QueryFilter<GlChartAccountSchemaClass>, session);
  }

  /**
   * Inserts a row, reporting a code collision rather than throwing.
   *
   * The unique index on `code` is the only race-proof check: two simultaneous admin
   * creates would both pass a read-before-write "does this code exist" query.
   */
  async insertUnique(data: NewLedgerAccount): Promise<InsertLedgerAccountResult> {
    try {
      return { account: (await this.create({ ...data })) as GlChartAccountDocument };
    } catch (error) {
      if (isDuplicateKey(error)) return { conflict: true };
      throw error;
    }
  }

  /**
   * Applies a partial update by business key and returns the new document.
   *
   * `findOneAndUpdate` rather than `document.save()`, so concurrent writes to unrelated
   * fields cannot lose each other to a stale in-memory copy.
   */
  async patchByCode(
    code: string,
    update: Record<string, unknown>,
  ): Promise<GlChartAccountDocument | null> {
    return this.updateOne({ code } as QueryFilter<GlChartAccountSchemaClass>, {
      $set: update,
    }) as Promise<GlChartAccountDocument | null>;
  }

  /** Seeder upsert: inserts the row if absent, otherwise leaves it untouched. */
  async insertSeededMany(accounts: NewLedgerAccount[], session: ClientSession): Promise<number> {
    const result = await this.collection.bulkWrite(
      accounts.map((account) => ({
        updateOne: {
          filter: { code: account.code },
          update: { $setOnInsert: { ...account } },
          upsert: true,
        },
      })),
      { session },
    );
    return result.upsertedCount;
  }
}

/** MongoDB reports every unique-index violation as error code 11000. */
function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}
