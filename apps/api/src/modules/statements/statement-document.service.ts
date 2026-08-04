/**
 * Renders a statement into the file the customer actually downloads.
 *
 * CSV and OFX are produced by the transaction module's exporters rather than by a second
 * pair written here. A statement and an export of the same period must agree row for row,
 * and the only way to guarantee that is for one renderer to serve both — a lookalike CSV
 * would drift the first time a column was added to one and not the other.
 *
 * PDF is this module's own, because a statement is the one document the bank attests to:
 * it carries the letterhead, the account's identifiers and a closing balance the ledger
 * has been reconciled against. That is exactly why `TransactionExportService` refuses to
 * produce one and points here.
 */

import { Injectable } from '@nestjs/common';

import { StatementFormat } from '@reliance/contracts';

import { AppConfigService } from '../../config/config.service.js';
import { type AccountRecord } from '../accounts/index.js';
import { toCsv } from '../transactions/export/csv.exporter.js';
import { toOfx } from '../transactions/export/ofx.exporter.js';

import { renderStatementPdf } from './documents/statement.pdf.js';
import { StatementBuilderService, type StatementDetail } from './statement-builder.service.js';
import { statementId } from './statement-id.js';
import { type StatementPeriod } from './statement-period.js';

/** A rendered document, ready for the HTTP layer to attach headers to. */
export interface RenderedDocument {
  readonly body: Buffer;
  readonly contentType: string;
  readonly filename: string;
}

const CONTENT_TYPES: Readonly<Record<StatementFormat, string>> = {
  [StatementFormat.PDF]: 'application/pdf',
  [StatementFormat.CSV]: 'text/csv; charset=utf-8',
  [StatementFormat.OFX]: 'application/x-ofx',
};

@Injectable()
export class StatementDocumentService {
  constructor(
    private readonly builder: StatementBuilderService,
    private readonly config: AppConfigService,
  ) {}

  /** Builds the statement for the period and renders it in the format asked for. */
  async render(input: {
    account: AccountRecord;
    period: StatementPeriod;
    format: StatementFormat;
  }): Promise<RenderedDocument> {
    const detail = await this.builder.detail(input.account, input.period);
    const body = await this.bytes(input.account, detail, input.format);

    return {
      body,
      contentType: CONTENT_TYPES[input.format],
      filename: filenameFor(input.account, input.period, input.format),
    };
  }

  private async bytes(
    account: AccountRecord,
    detail: StatementDetail,
    format: StatementFormat,
  ): Promise<Buffer> {
    if (format === StatementFormat.CSV) return Buffer.from(toCsv(detail.records), 'utf8');
    if (format === StatementFormat.OFX) return Buffer.from(this.ofx(account, detail), 'utf8');

    return renderStatementPdf({
      bank: this.config.bank.name,
      account,
      period: detail.period,
      figures: detail.figures,
      records: detail.records,
      statementId: statementId({ accountId: account.id, period: detail.period, format }),
    });
  }

  /**
   * The closing balance handed to OFX is the statement's, not the last row's.
   *
   * A period with no transactions still has a balance to declare, and it is the one the
   * account was left at before the period opened — which the exporter cannot see.
   */
  private ofx(account: AccountRecord, detail: StatementDetail): string {
    return toOfx({
      accountId: account.id,
      records: detail.records,
      currency: account.currency,
      closingBalance: detail.figures.closing.toMajorString(),
      generatedAt: detail.period.end,
      from: detail.period.start,
      to: detail.period.end,
    });
  }
}

const EXTENSIONS: Readonly<Record<StatementFormat, string>> = {
  [StatementFormat.PDF]: 'pdf',
  [StatementFormat.CSV]: 'csv',
  [StatementFormat.OFX]: 'ofx',
};

function filenameFor(
  account: AccountRecord,
  period: StatementPeriod,
  format: StatementFormat,
): string {
  return `statement_${account.number}_${period.startDay}_${period.endDay}.${EXTENSIONS[format]}`;
}
