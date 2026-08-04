/**
 * Request shapes the frozen contract does not name.
 *
 * `packages/contracts` defines the profile and the patch that changes it. It does not
 * define the closure body or the export body — the routes exist in `routes.profile` and
 * `packages/api-client` already posts to them, so the schemas have to exist somewhere, and
 * inventing shapes inside a frozen package is how a contract stops being frozen.
 *
 * They are built from the contract's own primitives, so an account id is validated the same
 * way here as everywhere else, and they mirror `packages/api-client/src/resources/profile.ts`
 * field for field.
 */

import { z } from 'zod';

import { entityId, mediumTextSchema, shortTextSchema } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { DATA_EXPORT_CATEGORIES } from './profile.constants.js';

/**
 * Closing the whole relationship.
 *
 * `confirm` is a literal `true` rather than a boolean: a body assembled with the field
 * missing, or defaulted to false somewhere in a client, fails validation instead of closing
 * an account. `reason` is required because the bank reads them, and because a destructive
 * action with no stated cause is one nobody can review afterwards.
 *
 * `sweepToAccountId` is accepted for contract compatibility and checked for sense, but no
 * relationship closure sweeps anything — every destination it could name is being closed
 * too. See `profile-closure.service.ts`.
 */
export const closeCustomerAccountSchema = z.object({
  reason: mediumTextSchema,
  sweepToAccountId: entityId('acc').optional(),
  confirm: z.literal(true),
});

/** Body of `POST /profile/close`. */
export type CloseCustomerAccount = z.infer<typeof closeCustomerAccountSchema>;

/**
 * Asking for a copy of everything the bank holds.
 *
 * `includes` narrows the copy; an empty array means everything, which is both the client's
 * default and the right default for a subject-access request. Unknown category names are
 * refused rather than ignored — a customer who asked for something we quietly dropped would
 * be told their export was complete when it was not.
 */
export const requestDataExportSchema = z.object({
  includes: z.array(shortTextSchema).default([]),
  format: z.enum(['JSON', 'CSV', 'ZIP']).default('ZIP'),
});

/** Body of `POST /profile/export`. */
export type RequestDataExport = z.infer<typeof requestDataExportSchema>;

/** The categories a request may name, uppercased so `accounts` and `ACCOUNTS` both work. */
export function resolveCategories(includes: readonly string[]): readonly string[] {
  if (includes.length === 0) return DATA_EXPORT_CATEGORIES;

  const asked = includes.map((entry) => entry.trim().toUpperCase());
  const unknown = asked.filter((entry) => !DATA_EXPORT_CATEGORIES.includes(entry));
  if (unknown.length > 0) throw unknownCategories(unknown);

  return DATA_EXPORT_CATEGORIES.filter((category) => asked.includes(category));
}

function unknownCategories(unknown: readonly string[]): AppError {
  return AppError.validation(`We do not hold anything called ${unknown.join(', ')}.`, [
    { path: 'includes', message: `Choose from ${DATA_EXPORT_CATEGORIES.join(', ')}` },
  ]);
}
