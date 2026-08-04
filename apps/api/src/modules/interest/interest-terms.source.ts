import { Injectable } from '@nestjs/common';

import { type InterestTier } from '@reliance/contracts';

import { ProductService } from '../products/index.js';

/**
 * Where the engine reads the rate table an account was sold under.
 *
 * A port rather than a direct dependency on the products lane so the engine's services
 * and fixtures run against a static table, and so the rule "an account is priced by the
 * version it was opened on, forever" has exactly one seam to come through.
 */
export abstract class InterestTermsSource {
  /**
   * The credit bands of one pinned product version, ordered by `fromAmount` ascending.
   * Empty for a product that pays no credit interest.
   */
  abstract creditTiersFor(productCode: string, productVersion: number): Promise<InterestTier[]>;
}

/**
 * Terms from the live catalogue.
 *
 * `ProductService.getVersion` reads the exact version the account pinned at opening,
 * unfiltered by date or status — a repricing since then must not reprice the account,
 * which is precisely what makes the lookup version-keyed rather than "current".
 */
@Injectable()
export class ProductInterestTermsSource extends InterestTermsSource {
  constructor(private readonly products: ProductService) {
    super();
  }

  override async creditTiersFor(
    productCode: string,
    productVersion: number,
  ): Promise<InterestTier[]> {
    const product = await this.products.getVersion(productCode, productVersion);
    return product.creditInterestTiers;
  }
}
