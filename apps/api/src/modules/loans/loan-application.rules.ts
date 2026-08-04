/**
 * The rules that guard an application's transitions, and the errors they raise.
 *
 * Kept apart from the services so that both the customer path and the underwriter path
 * enforce the same ones. A rule written twice is a rule that will eventually be written
 * two different ways, and the two paths into a lending decision are exactly where that
 * would matter.
 */

import { type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import {
  type LoanApplicationPatchFields,
  type LoanApplicationRecord,
  type LoanApplicationStore,
} from './loan-application.store.js';
import { LoanApplicationStatus } from './loan.types.js';

/** Statuses from which an application can still be decided. */
const DECIDABLE: ReadonlySet<LoanApplicationStatus> = new Set([
  LoanApplicationStatus.SUBMITTED,
  LoanApplicationStatus.UNDER_REVIEW,
  LoanApplicationStatus.REFERRED,
]);

/** Statuses from which an offer can still be accepted. */
const ACCEPTABLE: ReadonlySet<LoanApplicationStatus> = new Set([LoanApplicationStatus.OFFER_MADE]);

/**
 * The one "no such application" error.
 *
 * `NOT_FOUND` whether the application is missing or belongs to somebody else: a `FORBIDDEN`
 * on the second case would confirm that the id is real, which is all an enumeration attack
 * needs.
 */
export function applicationNotFound(applicationId: string): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: 'We could not find that loan application.',
    context: { applicationId },
  });
}

/**
 * Refuses a second decision on a settled application.
 *
 * @throws {AppError} `PRECONDITION_FAILED`.
 */
export function assertDecidable(record: LoanApplicationRecord): void {
  if (DECIDABLE.has(record.status)) return;

  throw new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message: 'This application has already been decided and cannot be changed.',
    context: { applicationId: record.id, status: record.status },
  });
}

/**
 * Refuses acceptance of an offer that is not on the table.
 *
 * Expiry is checked against the caller's business date rather than trusted from the
 * status, so an offer whose sweep has not run yet is still refused. A customer must not
 * get a better rate than the market currently supports because a job was late.
 *
 * @throws {AppError} `PRECONDITION_FAILED` or `LOAN_NOT_ELIGIBLE`.
 */
export function assertOfferAcceptable(record: LoanApplicationRecord, asOf: Date): void {
  if (!ACCEPTABLE.has(record.status) || !record.offer) {
    throw new AppError({
      code: ErrorCode.PRECONDITION_FAILED,
      message: 'There is no live offer on this application to accept.',
      context: { applicationId: record.id, status: record.status },
    });
  }

  if (record.offerExpiresAt && record.offerExpiresAt.getTime() <= asOf.getTime()) {
    throw new AppError({
      code: ErrorCode.LOAN_NOT_ELIGIBLE,
      message:
        'This offer has expired. Rates move, so we need to look at your application ' +
        'again before we can lend — starting a new one takes a couple of minutes.',
      context: { applicationId: record.id },
    });
  }
}

/**
 * Patches an application and insists it was still there.
 *
 * @throws {AppError} `NOT_FOUND` when the record vanished between read and write.
 */
export async function patchOrThrow(
  store: LoanApplicationStore,
  id: string,
  fields: LoanApplicationPatchFields,
  session?: ClientSession,
): Promise<LoanApplicationRecord> {
  const updated = await store.patch(id, fields, session);
  if (!updated) throw applicationNotFound(id);
  return updated;
}
