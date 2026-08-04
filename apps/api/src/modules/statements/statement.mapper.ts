/**
 * Period summary to the contract's `Statement`.
 *
 * `sizeBytes` is null on every statement this bank hands out, and that is the honest
 * answer rather than a gap: the document is rendered when the link is followed, so until
 * somebody follows it there is no file and no size. Reporting a figure would mean
 * rendering every statement in the archive to weigh it.
 */

import { type Statement } from '@reliance/contracts';

import { type PeriodSummary } from './statement-builder.service.js';

/** Everything the wire shape needs beyond the summary itself. */
export interface StatementView extends PeriodSummary {
  readonly id: string;
  readonly accountId: string;
  readonly downloadUrl: string;
  readonly generatedAt: Date;
}

export function toContractStatement(view: StatementView): Statement {
  return {
    id: view.id,
    accountId: view.accountId,
    period: view.period.label,
    periodStart: view.period.startDay,
    periodEnd: view.period.endDay,
    openingBalance: view.figures.opening.toJSON(),
    closingBalance: view.figures.closing.toJSON(),
    totalCredits: view.figures.credits.toJSON(),
    totalDebits: view.figures.debits.toJSON(),
    transactionCount: view.figures.count,
    downloadUrl: view.downloadUrl,
    sizeBytes: null,
    generatedAt: view.generatedAt.toISOString(),
  };
}
