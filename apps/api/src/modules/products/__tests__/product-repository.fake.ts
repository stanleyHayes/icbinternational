import { type Product } from '@reliance/contracts';

import { toStorableProduct } from '../product.mapper.js';
import { type ProductRepository } from '../product.repository.js';
import { type ProductDocument } from '../product.schema.js';

/**
 * An in-memory `ProductRepository`.
 *
 * The version-resolution rules are the part of the catalogue worth testing hardest, and
 * they are expressed partly as a Mongo query and partly as a sort. Reimplementing both
 * here — the date filter and the `effectiveFrom` then `version` descending ordering — lets
 * the service's own logic be exercised in milliseconds. The Mongo query itself is covered
 * by the seed integration test.
 */
export class FakeProductRepository {
  private readonly rows: ProductDocument[] = [];

  /** Adds a version directly, bypassing the service, to arrange a test's starting state. */
  seed(product: Product, id = `prd_${product.code}_${product.version}`): this {
    this.rows.push(asDocument(product, id));
    return this;
  }

  get all(): readonly ProductDocument[] {
    return this.rows;
  }

  async findEffective(code: string, asOf: string): Promise<ProductDocument | null> {
    const [first] = sortByEffectiveDescending(
      this.rows.filter((row) => row.code === code && isInForce(row, asOf)),
    );
    return first ?? null;
  }

  async findAllEffective(asOf: string): Promise<ProductDocument[]> {
    const inForce = this.rows.filter((row) => isInForce(row, asOf));
    return sortByEffectiveDescending(inForce).sort((left, right) =>
      left.code.localeCompare(right.code),
    );
  }

  async findVersions(code: string): Promise<ProductDocument[]> {
    return this.rows
      .filter((row) => row.code === code)
      .sort((left, right) => left.version - right.version);
  }

  async findByVersion(code: string, version: number): Promise<ProductDocument | null> {
    return this.rows.find((row) => row.code === code && row.version === version) ?? null;
  }

  async findLatestPerCode(): Promise<ProductDocument[]> {
    const newestFirst = [...this.rows].sort(
      (left, right) => left.code.localeCompare(right.code) || right.version - left.version,
    );

    const seen = new Set<string>();
    return newestFirst.filter((row) => {
      if (seen.has(row.code)) return false;
      seen.add(row.code);
      return true;
    });
  }

  async latestVersionNumber(code: string): Promise<number> {
    const versions = await this.findVersions(code);
    return versions.at(-1)?.version ?? 0;
  }

  async findOne(filter: { code?: string; version?: number }): Promise<ProductDocument | null> {
    return (
      this.rows.find(
        (row) =>
          (filter.code === undefined || row.code === filter.code) &&
          (filter.version === undefined || row.version === filter.version),
      ) ?? null
    );
  }

  async create(data: Record<string, unknown>): Promise<ProductDocument> {
    const row = data as unknown as ProductDocument;
    this.rows.push(row);
    return row;
  }

  /** Hands the fake to a service that expects the real repository. */
  asRepository(): ProductRepository {
    return this as unknown as ProductRepository;
  }
}

function asDocument(product: Product, id: string): ProductDocument {
  return { id, ...toStorableProduct(product) } as unknown as ProductDocument;
}

function isInForce(row: ProductDocument, asOf: string): boolean {
  return row.effectiveFrom <= asOf && (row.effectiveTo === null || row.effectiveTo > asOf);
}

/**
 * Newest first, breaking a same-day tie by version.
 *
 * `Array.prototype.sort` is stable, so the secondary sort by code in `findAllEffective`
 * preserves this ordering within each code — which is precisely what the service's
 * "first row per code wins" relies on.
 */
function sortByEffectiveDescending(rows: readonly ProductDocument[]): ProductDocument[] {
  return [...rows].sort((left, right) => {
    if (left.effectiveFrom !== right.effectiveFrom) {
      return left.effectiveFrom < right.effectiveFrom ? 1 : -1;
    }
    return right.version - left.version;
  });
}
