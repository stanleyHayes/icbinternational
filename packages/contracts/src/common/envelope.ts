/**
 * Response envelopes.
 *
 * Every endpoint answers in one of exactly two shapes — a success envelope or an error
 * envelope. Clients can therefore write one response handler instead of one per route,
 * and an unfamiliar failure is still parseable.
 */

import { z } from 'zod';

import { ErrorCode } from './error-codes.js';
import { isoDateTimeSchema } from './primitives.js';

// --- Errors ---------------------------------------------------------------

/** A single field-level validation failure. */
export const fieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ErrorCode),
    message: z.string(),
    /** Field-level detail for `VALIDATION_FAILED`; rule-specific detail otherwise. */
    details: z.array(fieldErrorSchema).optional(),
    /** Correlates the response with server logs. Always present. */
    traceId: z.string(),
    at: isoDateTimeSchema,
    /** Present on `RATE_LIMITED` and transient rail failures. */
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

// --- Pagination -----------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * Cursor pagination everywhere a list can grow. Offsets skip or repeat rows when the
 * underlying collection is being written to, which for a transaction feed is constant.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export const pageInfoSchema = z.object({
  /** Opaque cursor for the next page; absent when the list is exhausted. */
  cursor: z.string().nullable(),
  limit: z.number().int(),
  hasMore: z.boolean(),
  /** Only returned where a count is cheap — never on the transaction feed. */
  total: z.number().int().optional(),
});

export type PageInfo = z.infer<typeof pageInfoSchema>;

/** Wraps an item schema in the standard list envelope. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), page: pageInfoSchema });
}

export interface Paginated<T> {
  data: T[];
  page: PageInfo;
}

/** Wraps an item schema in the standard single-resource envelope. */
export function resource<T extends z.ZodType>(item: T) {
  return z.object({ data: item });
}

export interface Resource<T> {
  data: T;
}

// --- Sorting & search -----------------------------------------------------

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export const dateRangeSchema = z
  .object({ from: isoDateTimeSchema.optional(), to: isoDateTimeSchema.optional() })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });

export type DateRange = z.infer<typeof dateRangeSchema>;

// --- Acknowledgements -----------------------------------------------------

/** Response for endpoints whose only meaningful answer is "done". */
export const acknowledgedSchema = z.object({
  data: z.object({ acknowledged: z.literal(true) }),
});

export type Acknowledged = z.infer<typeof acknowledgedSchema>;
