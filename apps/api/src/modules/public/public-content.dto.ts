/**
 * Query shapes for the public content listings.
 *
 * Deliberately small. Every filter here is one the marketing site's navigation actually
 * offers; an open-ended query surface on an unauthenticated, cached endpoint is a way of
 * fragmenting the cache and inviting enumeration for no product benefit.
 */

import { z } from 'zod';

/** Longest category or tag the navigation offers. */
const MAX_FACET_LENGTH = 60;

export const listPostsQuerySchema = z.object({
  category: z.string().trim().max(MAX_FACET_LENGTH).optional(),
  tag: z.string().trim().max(MAX_FACET_LENGTH).optional(),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
