import { Controller, Get, Param, Query } from '@nestjs/common';

import {
  routes,
  type Paginated,
  type Product,
  type ProductFees,
  type ProductRates,
} from '@reliance/contracts';

import { wholeList } from '../../common/pagination/cursor.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';

import { ProductService } from './product.service.js';
import { productCatalogueQuerySchema, type ProductCatalogueQuery } from './products.dto.js';

/**
 * The contract's route map has no public per-product path, only the collection.
 *
 * Derived from the collection route so the two cannot drift, and proposed as a contract
 * addition in `docs/CONTRACT_CHANGES.md`. Declared above the controller because a
 * decorator argument is evaluated when the class is defined.
 */
const PRODUCT_BY_CODE_ROUTE = `${routes.public.products}/:code`;

/**
 * The public product catalogue.
 *
 * Read-only and unauthenticated: this is the same data the marketing site renders on its
 * pricing pages, and a customer comparing accounts has not signed in yet. Every response
 * is the version in force on the requested date, so a fee page can be linked to from a
 * statement and still show the terms that statement was priced under.
 */
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductService) {}

  /** Products open to new applications, one version each. */
  @Get(routes.public.products)
  async list(
    @Query(zodBody(productCatalogueQuerySchema)) query: ProductCatalogueQuery,
  ): Promise<Paginated<Product>> {
    return wholeList(await this.products.listCatalogue(query.asOf));
  }

  /**
   * Every fee the catalogue charges, grouped by product.
   *
   * Backs the "fees and charges" page, which regulators expect to be a single document
   * rather than something a customer has to assemble by opening five product pages.
   */
  @Get(routes.public.fees)
  async fees(
    @Query(zodBody(productCatalogueQuerySchema)) query: ProductCatalogueQuery,
  ): Promise<Paginated<ProductFees>> {
    const products = await this.products.listCatalogue(query.asOf);

    return wholeList(
      products.map((product) => ({
        code: product.code,
        name: product.name,
        monthlyFee: product.monthlyFee,
        fees: product.fees,
      })),
    );
  }

  /**
   * Every rate the catalogue pays or charges, grouped by product.
   *
   * Backs the public interest-rates page. Like the fees page, it answers with the version
   * in force on the requested date, so a rate quoted on a statement can be checked against
   * the table that was actually published that day.
   */
  @Get(routes.public.rates)
  async rates(
    @Query(zodBody(productCatalogueQuerySchema)) query: ProductCatalogueQuery,
  ): Promise<Paginated<ProductRates>> {
    const products = await this.products.listCatalogue(query.asOf);

    return wholeList(
      products.map((product) => ({
        code: product.code,
        name: product.name,
        accountType: product.accountType,
        creditInterestTiers: product.creditInterestTiers,
        debitInterestBps: product.debitInterestBps,
        effectiveFrom: product.effectiveFrom,
      })),
    );
  }

  /** One product, resolved for the requested date. */
  @Get(PRODUCT_BY_CODE_ROUTE)
  async byCode(
    @Param('code') code: string,
    @Query(zodBody(productCatalogueQuerySchema)) query: ProductCatalogueQuery,
  ): Promise<Product> {
    return this.products.requireActive(code, query.asOf);
  }
}
