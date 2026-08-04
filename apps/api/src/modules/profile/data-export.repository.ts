/**
 * Persistence for the `customer_data_exports` collection.
 *
 * Not an `AuditSubjectLoader`. The event worth recording is "this customer asked for a copy
 * of their data", which the `@Audited()` route already files from the request; diffing the
 * document would put the sealed payload's before and after into a second collection.
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { BaseRepository } from '../../database/base.repository.js';

import { type DataExportDocument, type DataExportSchemaClass } from './data-export.schema.js';
import { DATA_EXPORT_MODEL } from './profile.constants.js';

type Filter = QueryFilter<DataExportSchemaClass>;

/** Everything a new copy needs. The id and the timestamps are the repository's business. */
export interface NewDataExport {
  readonly userId: string;
  readonly status: DataExportSchemaClass['status'];
  readonly includes: readonly string[];
  readonly format: string;
  readonly payload: string;
  readonly expiresAt: Date;
}

@Injectable()
export class DataExportRepository extends BaseRepository<DataExportSchemaClass> {
  constructor(
    @InjectModel(DATA_EXPORT_MODEL) model: Model<DataExportSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  /**
   * Records the request and the copy it gathered.
   *
   * The public id borrows the `doc_` prefix. A subject-access copy is a document the bank
   * produced for a customer, which is what that prefix means; minting a new one would mean
   * editing the shared prefix table, and this lane does not own it.
   */
  async insertExport(row: NewDataExport, session?: ClientSession): Promise<DataExportDocument> {
    return this.create(
      { ...row, includes: [...row.includes], id: this.ids.generate('document') },
      session,
    ) as Promise<DataExportDocument>;
  }

  /** The customer's most recent request, or null when they have never asked. */
  async findLatestForUser(userId: string): Promise<DataExportDocument | null> {
    const [latest] = (await this.find({ userId } as Filter, {
      sort: { createdAt: -1 },
      limit: 1,
    })) as DataExportDocument[];

    return latest ?? null;
  }
}
