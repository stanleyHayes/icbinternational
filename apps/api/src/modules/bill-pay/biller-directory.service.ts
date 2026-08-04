import { Injectable } from '@nestjs/common';
import { type z } from 'zod';

import { listBillersQuerySchema, type Biller, type Paginated } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { encodeCursor, decodeCursor } from '../../common/pagination/cursor.js';
import { BillerRailPort, type BillerAccountCheck } from '../../rails/biller/index.js';

import { BILLER_PAGE_SIZE } from './bill-pay.constants.js';
import { BillerDirectoryStore } from './biller-directory.store.js';

/** Cursor sort key for the directory. The list is static, so an offset is a stable anchor. */
const DIRECTORY_SORT_KEY = 'biller';

/**
 * The directory query, inferred from the contract schema.
 *
 * The contract exports `listBillersQuerySchema` as a value but never names its inferred
 * type, so inferring here is the only way to stay pinned to the contract rather than
 * restating it. See `docs/CONTRACT_CHANGES.md`.
 */
export type ListBillersQuery = z.infer<typeof listBillersQuerySchema>;

/**
 * Browsing and confirming billers.
 *
 * The directory is small, static reference data written by the seed, so paging is by offset
 * rather than keyset — the objection to offsets is that rows shift underneath a reader, and
 * these do not shift at all between seed runs. The offset is still carried in the same
 * opaque cursor every other list in the API uses, so a client cannot tell the difference and
 * a future move to keyset breaks nobody.
 */
@Injectable()
export class BillerDirectoryService {
  constructor(
    private readonly directory: BillerDirectoryStore,
    private readonly rail: BillerRailPort,
  ) {}

  /** The directory screen: filtered by category, searchable by name. */
  async list(query: ListBillersQuery): Promise<Paginated<Biller>> {
    const limit = query.limit ?? BILLER_PAGE_SIZE;
    const offset = offsetFrom(query.cursor);
    const page = await this.directory.list({
      limit,
      offset,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { search: query.search } : {}),
    });

    const nextOffset = offset + page.billers.length;
    const hasMore = nextOffset < page.total;

    return {
      data: [...page.billers],
      page: {
        cursor: hasMore
          ? encodeCursor({ sortValue: DIRECTORY_SORT_KEY, id: String(nextOffset) })
          : null,
        limit,
        hasMore,
        total: page.total,
      },
    };
  }

  /** One biller, or `NOT_FOUND`. */
  async require(billerId: string): Promise<Biller> {
    const biller = await this.directory.findById(billerId);
    if (!biller) throw AppError.notFound('That biller', billerId);
    return biller;
  }

  /** Asks the network whether a reference exists, before any money moves. */
  async checkAccount(biller: Biller, customerReference: string): Promise<BillerAccountCheck> {
    return this.rail.checkAccount({
      billerId: biller.id,
      customerReference: customerReference.trim(),
    });
  }
}

/** The offset a cursor encodes, or the start of the list when there is no cursor. */
function offsetFrom(cursor: string | undefined): number {
  const decoded = cursor ? decodeCursor(cursor) : null;
  const offset = decoded ? Number.parseInt(decoded.id, 10) : 0;

  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
}
