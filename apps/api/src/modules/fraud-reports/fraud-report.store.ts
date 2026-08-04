import { type ClientSession } from 'mongoose';

import { type CreateFraudReportRequest } from '@reliance/contracts';

import { type PageResult } from '../../common/pagination/cursor.js';

export abstract class FraudReportStore {
  abstract insert(row: NewFraudReport, session?: ClientSession): Promise<FraudReportRecord>;

  abstract listForUser(query: FraudReportListQuery): Promise<PageResult<FraudReportRecord>>;
}

export interface FraudReportRecord {
  readonly id: string;
  readonly reference: string;
  readonly userId: string;
  readonly kind: CreateFraudReportRequest['kind'];
  readonly description: string;
  readonly transactionIds: readonly string[];
  readonly freezeCards: boolean;
  readonly freezeAccounts: boolean;
  readonly frozenCardIds: readonly string[];
  readonly frozenAccountIds: readonly string[];
  readonly ticketId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewFraudReport = Omit<FraudReportRecord, 'id' | 'reference' | 'createdAt' | 'updatedAt'>;

export interface FraudReportListQuery {
  readonly userId: string;
  readonly cursor?: string;
  readonly limit: number;
}
