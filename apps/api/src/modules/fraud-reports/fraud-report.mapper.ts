import { type FraudReport } from '@reliance/contracts';

import {
  type FraudReportDocument,
  type FraudReportSchemaClass,
} from './fraud-report.schema.js';
import { type FraudReportRecord } from './fraud-report.store.js';

export function toContractFraudReport(record: FraudReportRecord): FraudReport {
  return {
    id: record.id,
    reference: record.reference,
    frozenCardIds: [...record.frozenCardIds],
    frozenAccountIds: [...record.frozenAccountIds],
    ticketId: record.ticketId,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toFraudReportRecord(document: FraudReportDocument): FraudReportRecord {
  return document.toObject<FraudReportSchemaClass>();
}
