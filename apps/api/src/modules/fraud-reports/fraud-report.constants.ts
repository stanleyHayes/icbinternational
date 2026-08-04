export const FRAUD_REPORT_MODEL = 'FraudReport';
export const FRAUD_REPORT_COLLECTION = 'fraud_reports';
export const FRAUD_REPORT_AUDIT_ENTITY = 'fraud-report';

export const FRAUD_REPORT_AUDIT_CAPTURE_FIELDS = Object.freeze([
  'id',
  'reference',
  'kind',
  'transactionIds',
  'freezeCards',
  'freezeAccounts',
  'frozenCardIds',
  'frozenAccountIds',
  'ticketId',
]);
