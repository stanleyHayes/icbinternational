import { z } from 'zod';

import { LedgerAccountType, shortTextSchema } from '@reliance/contracts';

/**
 * Request bodies for the chart-of-accounts endpoints.
 *
 * Composed from contract primitives rather than redeclared, so "a name" and "a type"
 * mean here exactly what they mean everywhere else. These are additive candidates for
 * `packages/contracts` (see the task handoff); until the frozen package takes them, they
 * live next to their only consumer.
 */

/** GL codes are exactly four digits — the same rule the ledger schema enforces. */
const glCodeSchema = z.string().regex(/^\d{4}$/, 'must be a four-digit GL code');

/** `POST /admin/gl/accounts`. */
export const createLedgerAccountBodySchema = z.object({
  code: glCodeSchema,
  name: shortTextSchema,
  type: z.enum(LedgerAccountType),
  isControlAccount: z.boolean().optional(),
});
export type CreateLedgerAccountBody = z.infer<typeof createLedgerAccountBodySchema>;

/** `PATCH /admin/gl/accounts/:code`. Only the name may ever change. */
export const renameLedgerAccountBodySchema = z.object({
  name: shortTextSchema,
});
export type RenameLedgerAccountBody = z.infer<typeof renameLedgerAccountBodySchema>;
