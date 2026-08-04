import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { BaseRepository } from '../../database/base.repository.js';
import { type AuditSubjectLoader } from '../audit/index.js';

import { FRAUD_REPORT_MODEL } from './fraud-report.constants.js';
import { toFraudReportRecord } from './fraud-report.mapper.js';
import {
  type FraudReportDocument,
  type FraudReportSchemaClass,
} from './fraud-report.schema.js';
import {
  FraudReportStore,
  type FraudReportListQuery,
  type FraudReportRecord,
  type NewFraudReport,
} from './fraud-report.store.js';

type Filter = QueryFilter<FraudReportSchemaClass>;

@Injectable()
export class FraudReportRepository
  extends BaseRepository<FraudReportSchemaClass>
  implements FraudReportStore, AuditSubjectLoader
{
  constructor(
    @InjectModel(FRAUD_REPORT_MODEL) model: Model<FraudReportSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async insert(row: NewFraudReport, session?: ClientSession): Promise<FraudReportRecord> {
    const id = this.ids.generate('fraudReport');
    const created = await this.create({ ...row, id, reference: id }, session);
    return toFraudReportRecord(created as FraudReportDocument);
  }

  async listForUser(query: FraudReportListQuery): Promise<PageResult<FraudReportRecord>> {
    const found = await this.find(filterFor(query), {
      sort: { createdAt: -1, id: -1 },
      limit: query.limit + 1,
    });

    return buildPage({
      records: found.map((document) => toFraudReportRecord(document as FraudReportDocument)),
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
  }

  async loadAuditSubject(entityId: string): Promise<Record<string, unknown> | null> {
    const found = await this.findOne({ id: entityId } as Filter);
    return found ? (found.toObject() as unknown as Record<string, unknown>) : null;
  }
}

function filterFor(query: FraudReportListQuery): Filter {
  const filter: Filter = { userId: query.userId };
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;

  if (cursor) {
    const at = new Date(cursor.sortValue);
    filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, id: { $lt: cursor.id } }];
  }

  return filter;
}
