import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, type Product } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  checkEligibility as evaluateEligibility,
  type ApplicantSnapshot,
  type EligibilityVerdict,
} from './eligibility.js';
import { FIRST_PRODUCT_VERSION } from './product.constants.js';
import { toContractProduct, toStorableProduct } from './product.mapper.js';
import { ProductRepository } from './product.repository.js';
import { type ProductDocument } from './product.schema.js';

/** A new version of a product. The version number is assigned, never supplied. */
export type ProductVersionDraft = Omit<Product, 'version'>;

/**
 * The product catalogue.
 *
 * Two rules hold this together. A version is immutable once written, and the version that
 * applies is chosen by date rather than by a mutable "current" flag. Together they mean an
 * account opened last year is priced by the terms it was sold, and a statement issued
 * today can still explain a fee charged under pricing that has since been withdrawn.
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly repository: ProductRepository,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * The version of `code` in force on `asOf`, or null if there is none.
   *
   * Deliberately ignores `active`: a withdrawn product still has to price the accounts
   * already on it. `active` governs who may *open* the product, which is a question for
   * {@link listCatalogue}, not for pricing an existing relationship.
   *
   * @param asOf ISO calendar date. Defaults to the simulated clock's today.
   */
  async findActive(code: string, asOf?: string, session?: ClientSession): Promise<Product | null> {
    const document = await this.repository.findEffective(code, this.resolveDate(asOf), session);
    return document ? toContractProduct(document) : null;
  }

  /** {@link findActive}, but a missing product is a `NOT_FOUND` rather than a null. */
  async requireActive(code: string, asOf?: string, session?: ClientSession): Promise<Product> {
    const product = await this.findActive(code, asOf, session);
    if (product) return product;

    throw new AppError({
      code: ErrorCode.NOT_FOUND,
      message: `No version of product ${code} was in force on ${this.resolveDate(asOf)}`,
      context: { code, asOf },
    });
  }

  /** Products open to new applications on `asOf`, one version each. */
  async listCatalogue(asOf?: string): Promise<Product[]> {
    const versions = await this.repository.findAllEffective(this.resolveDate(asOf));
    return latestPerCode(versions)
      .filter((product) => product.active)
      .map((document) => toContractProduct(document));
  }

  /** Every version ever published for `code`, oldest first. */
  async listVersions(code: string): Promise<Product[]> {
    const documents = await this.repository.findVersions(code);
    if (documents.length === 0) throw AppError.notFound('Product', code);
    return documents.map((document) => toContractProduct(document));
  }

  /**
   * The exact version an account is pinned to.
   *
   * This is the read that makes versioning safe: an account stores `(code, version)` at
   * opening, and this method returns those terms for as long as the account lives —
   * unfiltered by date or status, however many versions have been published since.
   */
  async getVersion(code: string, version: number, session?: ClientSession): Promise<Product> {
    const document = await this.repository.findByVersion(code, version, session);
    if (!document) {
      throw AppError.notFound('Product', `${code} v${version}`);
    }
    return toContractProduct(document);
  }

  /**
   * The newest version of every code, including withdrawn and future-dated ones.
   *
   * The admin catalogue view; the public catalogue is {@link listCatalogue}.
   */
  async listLatestPerCode(): Promise<Product[]> {
    const documents = await this.repository.findLatestPerCode();
    return documents.map((document) => toContractProduct(document));
  }

  /**
   * May an applicant open this product today?
   *
   * Thin orchestration over the pure rules in `eligibility.ts` — the rules are evaluated
   * against the version in force on `asOf`, because eligibility is a question about the
   * terms being sold, not about some historical edition.
   */
  async checkEligibility(
    code: string,
    applicant: ApplicantSnapshot,
    asOf?: string,
  ): Promise<EligibilityVerdict> {
    const product = await this.requireActive(code, asOf);
    return evaluateEligibility(product, applicant);
  }

  /**
   * Publishes the next version of a product.
   *
   * Inserts; never updates. The predecessor keeps its own `effectiveFrom` and stays
   * exactly as it was written, and resolution supersedes it by date.
   */
  async publishVersion(draft: ProductVersionDraft): Promise<Product> {
    const previous = await this.repository.latestVersionNumber(draft.code);
    await this.assertNotBackdated(draft);

    const version = previous + FIRST_PRODUCT_VERSION;
    const created = await this.insert({ ...draft, version });

    this.logger.log(`Published ${draft.code} v${version} effective ${draft.effectiveFrom}`);
    return toContractProduct(created);
  }

  /**
   * Writes an exact version if it is not already present.
   *
   * The seed's entry point. Idempotent by `{code, version}`: a second run finds the
   * version already there and leaves it untouched, which is what makes re-seeding a
   * populated database safe rather than a silent reprice of every existing account.
   *
   * @returns true when the version was inserted, false when it already existed.
   */
  async ensureVersion(product: Product): Promise<boolean> {
    const existing = await this.repository.findOne({
      code: product.code,
      version: product.version,
    });
    if (existing) return false;

    await this.insert(product);
    return true;
  }

  private async insert(product: Product): Promise<ProductDocument> {
    return this.repository.create({
      id: this.ids.generate('product'),
      ...toStorableProduct(product),
    }) as Promise<ProductDocument>;
  }

  /**
   * Refuses a version that would take effect before one already published.
   *
   * Backdating is the one edit that would retro-alter an existing account: a version
   * effective before the current one silently becomes the answer to "what were the terms
   * last month?", and every statement already sent under the old terms becomes wrong.
   */
  private async assertNotBackdated(draft: ProductVersionDraft): Promise<void> {
    const documents = await this.repository.findVersions(draft.code);
    const latest = documents.at(-1);
    if (!latest || draft.effectiveFrom >= latest.effectiveFrom) return;

    throw AppError.conflict(
      ErrorCode.CONFLICT,
      `Product ${draft.code} already has a version effective ${latest.effectiveFrom}; ` +
        'a new version cannot start earlier than the one it supersedes',
    );
  }

  private resolveDate(asOf?: string): string {
    return asOf ?? this.clock.today();
  }
}

/**
 * Keeps the first document seen for each code.
 *
 * The repository sorts by `effectiveFrom` then `version` descending within a code, so the
 * first occurrence is the one in force. Doing this in memory rather than with an
 * aggregation keeps the query plan a single index scan; the catalogue is a few dozen rows.
 */
function latestPerCode(documents: readonly ProductDocument[]): ProductDocument[] {
  const seen = new Set<string>();

  return documents.filter((document) => {
    if (seen.has(document.code)) return false;
    seen.add(document.code);
    return true;
  });
}
