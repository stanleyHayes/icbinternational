import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { type Biller } from '@reliance/contracts';

import { BILLER_MODEL } from './bill-pay.constants.js';
import { BillerDirectoryStore, type BillerQuery } from './biller-directory.store.js';
import { BillerSchemaClass, type BillerDocument } from './biller.schema.js';

/** Characters that mean something to a regular expression and nothing to a customer. */
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * MongoDB-backed directory reads.
 *
 * Search is an anchored, escaped case-insensitive match rather than a text index. The
 * directory is a few dozen rows that change only when the seed runs, so the collection
 * scan is cheaper than the index would be — and escaping the customer's input is not
 * optional: an unescaped `.*` in a search box is a denial-of-service waiting to be typed.
 */
@Injectable()
export class BillerDirectoryRepository extends BillerDirectoryStore {
  constructor(@InjectModel(BILLER_MODEL) private readonly model: Model<BillerSchemaClass>) {
    super();
  }

  override async list(query: BillerQuery): Promise<{ billers: readonly Biller[]; total: number }> {
    const filter = listFilter(query);

    const [documents, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ category: 1, name: 1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { billers: documents.map((document) => toBiller(document as BillerDocument)), total };
  }

  override async findById(id: string): Promise<Biller | null> {
    const document = await this.model.findOne({ id }).exec();
    return document ? toBiller(document as BillerDocument) : null;
  }
}

function listFilter(query: BillerQuery): QueryFilter<BillerSchemaClass> {
  return {
    active: true,
    ...(query.category ? { category: query.category } : {}),
    ...(query.search ? { name: { $regex: escapeRegex(query.search), $options: 'i' } } : {}),
  } as QueryFilter<BillerSchemaClass>;
}

/** Neutralises anything in the customer's search term that a regex engine would act on. */
export function escapeRegex(value: string): string {
  return value.replaceAll(REGEX_METACHARACTERS, String.raw`\$&`);
}

function toBiller(document: BillerDocument): Biller {
  const plain = document.toObject<BillerSchemaClass>();

  return {
    id: plain.id,
    name: plain.name,
    category: plain.category,
    logoUrl: plain.logoUrl,
    accountNumberPattern: plain.accountNumberPattern,
    accountNumberLabel: plain.accountNumberLabel,
    minAmount: plain.minAmount,
    maxAmount: plain.maxAmount,
    fee: plain.fee,
    supportsValidation: plain.supportsValidation,
    active: plain.active,
  } as Biller;
}
