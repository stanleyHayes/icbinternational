import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { Permission, routes, type Product } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AdminEndpoint } from '../rbac/index.js';

import { ProductService, type ProductVersionDraft } from './product.service.js';
import { publishProductVersionSchema } from './products.dto.js';

/**
 * The contract's route map has no admin version-history path, only the collection and
 * the item. Derived from the item route so the two cannot drift, and proposed as a
 * contract addition in `docs/CONTRACT_CHANGES.md`. Declared above the controller because
 * a decorator argument is evaluated when the class is defined.
 */
const ADMIN_PRODUCT_ROUTE = routes.admin.product(':code');

/**
 * Catalogue administration.
 *
 * Publishing a version is the only write. There is no edit and no delete: a version an
 * account was opened under must keep existing for as long as the account does, so the
 * catalogue corrects by superseding, never by rewriting.
 */
@AdminEndpoint(Permission.PRODUCT_WRITE)
@Controller()
export class AdminProductsController {
  constructor(private readonly products: ProductService) {}

  /** The newest version of every code, including withdrawn and future-dated ones. */
  @Get(routes.admin.products)
  list(): Promise<Product[]> {
    return this.products.listLatestPerCode();
  }

  /** Every version of one product, oldest first — the audit trail of its repricing. */
  @Get(ADMIN_PRODUCT_ROUTE)
  history(@Param('code') code: string): Promise<Product[]> {
    return this.products.listVersions(code);
  }

  /**
   * Publishes a new version.
   *
   * A code the catalogue has never seen starts at version 1; an existing code gets the
   * next number. The draft is validated against the same contract schema the public
   * catalogue serves, so nothing can be published that could not be read back.
   */
  @Post(routes.admin.products)
  publish(
    @Body(zodBody(publishProductVersionSchema)) draft: ProductVersionDraft,
  ): Promise<Product> {
    return this.products.publishVersion(draft);
  }
}
