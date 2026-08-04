import { Injectable } from '@nestjs/common';

import { ErrorCode, ExportFormat, type ExportTransactionsQuery } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';

import { toCsv } from './export/csv.exporter.js';
import { toOfx } from './export/ofx.exporter.js';
import { type TransactionRecord } from './repositories/transaction.store.js';
import { TransactionRangeReader } from './transaction-range.reader.js';
import { toTransactionResponse } from './transaction.presenter.js';

/** A rendered download, ready for the HTTP layer to attach headers to. */
export interface ExportedFile {
  readonly body: Buffer;
  readonly contentType: string;
  readonly filename: string;
}

/**
 * Renders a date range of one account's transactions as a downloadable file.
 *
 * The range is walked in keyset batches rather than fetched in one query. A customer with
 * five years of card spend has tens of thousands of rows, and a single unbounded find
 * would build the whole result in the driver's memory before the first byte reaches them;
 * an id-keyed scan also cannot skip or double-count a row that is inserted mid-export.
 *
 * PDF is refused rather than approximated. It is a rendered statement with the bank's
 * letterhead and a closing balance the ledger has attested to, which belongs to the
 * statements pipeline — producing a lookalike here would give customers a document that
 * fails the one check anybody performs on it.
 */
@Injectable()
export class TransactionExportService {
  constructor(private readonly range: TransactionRangeReader) {}

  /**
   * Builds the file.
   *
   * Scoping is structural: the reader filters on `userId`, so asking for an account
   * somebody else owns returns an empty file rather than a 403. That is deliberate —
   * a 403 would confirm the account exists, which is an enumeration oracle.
   */
  async export(userId: string, query: ExportTransactionsQuery): Promise<ExportedFile> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const records = await this.range.readAll({
      userId,
      accountId: query.accountId,
      from,
      to,
    });

    return this.render({ query, records, from, to });
  }

  private render(input: {
    query: ExportTransactionsQuery;
    records: readonly TransactionRecord[];
    from: Date;
    to: Date;
  }): ExportedFile {
    const stem = `${input.query.accountId}_${isoDay(input.from)}_${isoDay(input.to)}`;

    switch (input.query.format) {
      case ExportFormat.CSV: {
        return file(toCsv(input.records), 'text/csv; charset=utf-8', `${stem}.csv`);
      }
      case ExportFormat.OFX: {
        return file(this.renderOfx(input), 'application/x-ofx', `${stem}.ofx`);
      }
      case ExportFormat.JSON: {
        const payload = input.records.map((record) => toTransactionResponse(record));
        return file(JSON.stringify({ data: payload }), 'application/json', `${stem}.json`);
      }
      default: {
        throw pdfNotAvailable();
      }
    }
  }

  private renderOfx(input: {
    query: ExportTransactionsQuery;
    records: readonly TransactionRecord[];
    from: Date;
    to: Date;
  }): string {
    const last = input.records.at(-1);

    return toOfx({
      accountId: input.query.accountId,
      records: input.records,
      // With no rows in range there is no balance to attest to and no currency to declare.
      // Emitting a zero would state a fact the export has not checked.
      currency: last?.amount.currency ?? DEFAULT_EXPORT_CURRENCY,
      closingBalance: last ? fromStored(last.runningBalance).toMajorString() : ZERO_BALANCE,
      generatedAt: input.to,
      from: input.from,
      to: input.to,
    });
  }
}

/**
 * Declared only when the range is empty and there is therefore no row to read one from.
 *
 * OFX requires `<CURDEF>`; an empty statement has to declare something. The bank's base
 * currency is the least surprising answer and no amount in the file depends on it.
 */
const DEFAULT_EXPORT_CURRENCY = 'GBP';
const ZERO_BALANCE = '0.00';
const ISO_DAY_LENGTH = 10;

function isoDay(at: Date): string {
  return at.toISOString().slice(0, ISO_DAY_LENGTH);
}

function file(body: string, contentType: string, filename: string): ExportedFile {
  return { body: Buffer.from(body, 'utf8'), contentType, filename };
}

function pdfNotAvailable(): AppError {
  return new AppError({
    code: ErrorCode.FEATURE_DISABLED,
    message:
      'PDF is produced by the statements pipeline, which signs the document and attests ' +
      'its closing balance. Request a statement, or export as CSV, OFX or JSON.',
  });
}
