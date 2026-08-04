import { Injectable } from '@nestjs/common';

import { PRODUCTS_COLLECTION } from '../../modules/products/product.constants.js';
import { ProductService } from '../../modules/products/product.service.js';
import { type SeedOutcome, type Seeder } from '../seed.types.js';

import { FOUNDATION_PRODUCTS } from './catalogue/index.js';

/**
 * Seeds version 1 of the product catalogue.
 *
 * Unlike every other seeder, this one never updates an existing row. A product version is
 * immutable by design: if the catalogue definition changes after the seed has run, the
 * correct response is to publish version 2, not to rewrite version 1 underneath the
 * accounts that were sold on it. Re-running the seed therefore reports the products as
 * unchanged even when the source file has been edited — which is the behaviour that
 * protects a customer's terms, not a limitation of the seeder.
 *
 * Products go through `ProductService` rather than the raw collection because this module
 * owns them, and the service is where the version and identifier rules live.
 */
@Injectable()
export class ProductsSeeder implements Seeder {
  readonly name = 'products';

  constructor(private readonly products: ProductService) {}

  async run(): Promise<SeedOutcome> {
    let inserted = 0;

    for (const product of FOUNDATION_PRODUCTS) {
      // Sequential because `ensureVersion` reads before it writes, and running five of
      // those concurrently against one connection buys nothing at this size.
      const wasInserted = await this.products.ensureVersion(product);
      if (wasInserted) inserted += 1;
    }

    return {
      collection: PRODUCTS_COLLECTION,
      inserted,
      updated: 0,
      unchanged: FOUNDATION_PRODUCTS.length - inserted,
    };
  }
}
