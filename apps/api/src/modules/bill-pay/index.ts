/**
 * The bill-payment module's public surface.
 *
 * Other lanes import from here, never from a file inside. Mandates reuse the poster and the
 * submission service so a direct-debit collection is booked exactly the way a bill payment
 * is; the simulation lane uses the stores.
 */

export { BillPayModule } from './bill-pay.module.js';

export { BillPayService, type BillPaymentDraft } from './bill-pay.service.js';
export { TopUpService, providerSlug } from './top-up.service.js';
export { BillPaymentQueryService } from './bill-payment-query.service.js';
export { BillPaymentBookingService } from './bill-payment-booking.service.js';
export { BillPaymentPoster, type SettlementEntries } from './bill-payment.poster.js';
export { BillSubmissionService } from './bill-submission.service.js';
export { BillRefundService, type RefusalInput } from './bill-refund.service.js';
export { BillRefundSweeperService, type RefundSweepResult } from './bill-refund-sweeper.service.js';
export { BillRefundSweepProcessor } from './bill-refund-sweep.processor.js';
export { BillSubmissionQueue, type BillSubmissionJob } from './bill-submission.queue.js';
export { BillPaymentProcessor, type SubmissionResult } from './bill-payment.processor.js';
export { BillerDirectoryService, type ListBillersQuery } from './biller-directory.service.js';

export {
  BillPaymentStore,
  PaymentKind,
  type BillPaymentListQuery,
  type BillPaymentRecord,
  type BillPaymentTransition,
  type NewBillPayment,
  type StrandedQuery,
  type TopUpDetail,
} from './bill-payment.store.js';
export { BillPaymentRepository } from './bill-payment.repository.js';
export { InMemoryBillPaymentStore } from './in-memory-bill-payment.store.js';

export { BillerDirectoryStore, type BillerQuery } from './biller-directory.store.js';
export { BillerDirectoryRepository, escapeRegex } from './biller-directory.repository.js';
export { InMemoryBillerDirectoryStore } from './in-memory-biller-directory.store.js';

export {
  assertAmountAccepted,
  assertBillerActive,
  assertReferenceMatches,
} from './biller-validation.js';
export { billPaymentReversal } from './bill-payment-entries.js';
export { toContractBillPayment } from './bill-payment.mapper.js';

export {
  BILLER_COLLECTION,
  BILLER_MODEL,
  BILL_PAYMENT_COLLECTION,
  BILL_PAYMENT_MODEL,
  BILL_REFUND_SWEEP_JOB,
  BILL_SUBMISSION_JOB,
  MAX_SUBMISSION_ATTEMPTS,
  REFUND_STRANDED_AFTER_MS,
  REFUSAL_COPY,
  REJECTION_COPY,
} from './bill-pay.constants.js';
export {
  BillPaymentSchema,
  BillPaymentSchemaClass,
  type BillPaymentDocument,
} from './bill-payment.schema.js';
export { BillerSchema, BillerSchemaClass, type BillerDocument } from './biller.schema.js';
