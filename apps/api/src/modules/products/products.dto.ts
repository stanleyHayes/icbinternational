import { z } from 'zod';

import { isoDateSchema, productSchema } from '@reliance/contracts';

/**
 * Query parameters the public catalogue accepts.
 *
 * `asOf` exists so a statement, a closed account or an audit can ask the catalogue what
 * the terms were on a given day. Without it the only answerable question is "what do you
 * sell today", which is the wrong question for every one of those callers.
 */
export const productCatalogueQuerySchema = z.object({
  asOf: isoDateSchema.optional(),
});

export type ProductCatalogueQuery = z.infer<typeof productCatalogueQuerySchema>;

/**
 * A complete new version of a product, as an admin publishes it.
 *
 * The version number is assigned by the service — never supplied — so a draft is the
 * contract product minus its number. Everything else is stated in full rather than
 * patched: a repricing review reads the whole draft and approves exactly what customers
 * will be charged, with no "unchanged fields" to assume.
 */
export const publishProductVersionSchema = productSchema.omit({ version: true });

export type PublishProductVersion = z.infer<typeof publishProductVersionSchema>;
