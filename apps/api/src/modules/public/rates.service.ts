/**
 * Reading rate tables and the fee schedule out of the CMS.
 *
 * These are published documents like any other, which is deliberate: a rate change is an
 * editorial act that goes through review and leaves a revision, not a deployment. The
 * marketing site, the calculators and the admin console all read the same row.
 */

import { Injectable } from '@nestjs/common';

import { CustomerSegment, type FxBoard } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/config.service.js';
import { toIso } from '../accounts/index.js';
import { ContentKind, ContentService, type ContentRecord } from '../cms/index.js';
import { spreadBpsFor } from '../fx/fx-spread.js';
import { toContractRate } from '../fx/fx.mapper.js';
import { RateProviderPort } from '../fx/rate-feed/rate-provider.port.js';

import { type FeeRow, type FeeSchedule, type RateRow, type RateTable } from './public.dto.js';

/** How many tables a listing returns. There are a handful. */
const TABLE_LIMIT = 20;

/** Fields lifted out of a rate row into `detail`, in the order the site renders them. */
const DETAIL_KEYS = ['access', 'interestPaid', 'term', 'earlyRepayment', 'minimumOpening'] as const;

@Injectable()
export class RatesService {
  constructor(
    private readonly content: ContentService,
    private readonly rates: RateProviderPort,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  /** Every published rate table. */
  async tables(): Promise<RateTable[]> {
    const records = await this.content.listPublished(ContentKind.RATE_TABLE, TABLE_LIMIT);
    return records.map((record) => toRateTable(record));
  }

  /** @throws {AppError} `NOT_FOUND` when there is no published table at that slug. */
  async table(slug: string): Promise<RateTable> {
    const record = await this.content.findPublished(ContentKind.RATE_TABLE, slug);
    if (!record) throw AppError.notFound('Rate table', slug);
    return toRateTable(record);
  }

  /** Every published fee schedule. */
  async fees(): Promise<FeeSchedule[]> {
    const records = await this.content.listPublished(ContentKind.FEE_SCHEDULE, TABLE_LIMIT);
    return records.map((record) => toFeeSchedule(record));
  }

  /**
   * The representative rate for a product family, in basis points.
   *
   * Used by the calculators so their figures come from the published table rather than
   * from a constant that drifts away from it. Returns `null` when nothing is published,
   * and the caller decides what to do about that.
   */
  async representativeRate(tableSlug: string, productPrefix: string): Promise<RateRow | null> {
    const table = await this.content.findPublished(ContentKind.RATE_TABLE, tableSlug);
    if (!table) return null;

    return (
      toRateTable(table).rows.find((row) =>
        row.product.toLowerCase().startsWith(productPrefix.toLowerCase()),
      ) ?? null
    );
  }

  /** The unauthenticated FX board, priced at the standard retail spread. */
  async fxBoard(): Promise<FxBoard> {
    const base = this.config.bank.baseCurrency;
    const quotes = await this.rates.board(base);

    return {
      base,
      rates: quotes.map((quote) =>
        toContractRate(
          quote,
          spreadBpsFor({
            from: quote.rate.from,
            to: quote.rate.to,
            customer: { segment: CustomerSegment.PERSONAL, kycTier: 0 },
          }),
        ),
      ),
      asOf: toIso(this.clock.now()),
    };
  }
}

function readString(source: Record<string, unknown>, key: string, fallback = ''): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

function readRows(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = payload[key];
  return Array.isArray(value) ? (value.filter(isRecord) as Record<string, unknown>[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRateTable(record: ContentRecord): RateTable {
  return {
    slug: record.slug,
    title: record.title,
    effectiveFrom: readString(record.payload, 'effectiveFrom'),
    note: readString(record.payload, 'note'),
    rows: readRows(record.payload, 'rows').map((row) => toRateRow(row)),
  };
}

function toRateRow(row: Record<string, unknown>): RateRow {
  const rate = row.rateBasisPoints;

  const detail: Record<string, string> = {};
  for (const key of DETAIL_KEYS) {
    const value = row[key];
    if (typeof value === 'string') detail[key] = value;
  }

  return {
    product: readString(row, 'product'),
    rateBasisPoints: typeof rate === 'number' ? rate : 0,
    rateLabel: readString(row, 'rateLabel'),
    detail,
  };
}

function toFeeSchedule(record: ContentRecord): FeeSchedule {
  return {
    slug: record.slug,
    title: record.title,
    effectiveFrom: readString(record.payload, 'effectiveFrom'),
    note: readString(record.payload, 'note'),
    groups: readRows(record.payload, 'groups').map((group) => ({
      heading: readString(group, 'heading'),
      rows: readRows(group, 'rows').map((row) => toFeeRow(row)),
    })),
  };
}

function toFeeRow(row: Record<string, unknown>): FeeRow {
  const fee = row.feeMinorUnits;

  return {
    item: readString(row, 'item'),
    // A string on the wire, like every other amount in this API. JSON numbers are doubles.
    feeMinorUnits: typeof fee === 'number' ? String(Math.round(fee)) : '0',
    detail: readString(row, 'detail'),
  };
}
