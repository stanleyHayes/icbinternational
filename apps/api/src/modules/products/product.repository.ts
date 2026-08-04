import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { ProductSchemaClass, type ProductDocument } from './product.schema.js';

/**
 * Reads and writes product versions.
 *
 * Every read is version-aware. There is no "get the product" method, because there is no
 * such thing — there is only the version that applied on a given date, and a caller that
 * does not say which date it means is asking the wrong question.
 */
@Injectable()
export class ProductRepository extends BaseRepository<ProductSchemaClass> {
  constructor(@InjectModel(ProductSchemaClass.name) model: Model<ProductSchemaClass>) {
    super(model);
  }

  /**
   * The version of `code` in force on `asOf`, or null.
   *
   * Sorted by `effectiveFrom` then `version` descending so the most recently published
   * version wins a same-day tie — a correction issued after a mistake supersedes it.
   */
  async findEffective(
    code: string,
    asOf: string,
    session?: ClientSession,
  ): Promise<ProductDocument | null> {
    const [document] = await this.find(effectiveFilter(code, asOf), {
      sort: { effectiveFrom: -1, version: -1 },
      limit: 1,
      session,
    });

    return document ?? null;
  }

  /** Every version of every code that is in force on `asOf`, newest first per code. */
  async findAllEffective(asOf: string, session?: ClientSession): Promise<ProductDocument[]> {
    return this.find(dateFilter(asOf), {
      sort: { code: 1, effectiveFrom: -1, version: -1 },
      session,
    });
  }

  /** Every version of one code, oldest first. Used by the admin version history. */
  async findVersions(code: string, session?: ClientSession): Promise<ProductDocument[]> {
    return this.find({ code }, { sort: { version: 1 }, session });
  }

  /**
   * One exact version, identified the way an account pins it.
   *
   * Deliberately not date- or status-filtered: an account opened under v1 must be able to
   * read v1's terms for as long as it exists, however many versions have come since.
   */
  async findByVersion(
    code: string,
    version: number,
    session?: ClientSession,
  ): Promise<ProductDocument | null> {
    return this.findOne({ code, version }, session);
  }

  /**
   * The newest version of every code, published or not.
   *
   * The admin catalogue view needs the codes the public one hides — withdrawn products
   * and future-dated versions — so it reads without the effective-date filter and dedupes
   * on the first row per code, which the sort makes the newest.
   */
  async findLatestPerCode(session?: ClientSession): Promise<ProductDocument[]> {
    const documents = await this.find({}, { sort: { code: 1, version: -1 }, session });

    const seen = new Set<string>();
    return documents.filter((document) => {
      if (seen.has(document.code)) return false;
      seen.add(document.code);
      return true;
    });
  }

  /** Highest version number issued for `code`, or 0 when the code is new. */
  async latestVersionNumber(code: string, session?: ClientSession): Promise<number> {
    const [document] = await this.find({ code }, { sort: { version: -1 }, limit: 1, session });
    return document?.version ?? 0;
  }
}

/** Versions that had started and had not stopped by `asOf`. */
function dateFilter(asOf: string) {
  return {
    effectiveFrom: { $lte: asOf },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: asOf } }],
  };
}

function effectiveFilter(code: string, asOf: string) {
  return { code, ...dateFilter(asOf) };
}
