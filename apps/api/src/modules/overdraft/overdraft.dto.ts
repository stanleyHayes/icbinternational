/**
 * Request and response shapes for overdrafts.
 *
 * The frozen contract names the route (`POST /overdraft/request`) but no schema for it, so
 * these are the module's own, written in the contract's style so they can be lifted into
 * it unchanged. `docs/CONTRACT_CHANGES.md` carries the proposal.
 */

import { z } from 'zod';

import { entityId, moneySchema, positiveMoneySchema } from '@reliance/contracts';

import { OverdraftStatus } from './overdraft.store.js';

/** Employment history is capped at a working lifetime; anything longer is a typo. */
const MAX_EMPLOYMENT_MONTHS = 720;

/** Asking for a facility on a current account. */
export const requestOverdraftRequestSchema = z.object({
  accountId: entityId('acc'),
  requestedLimit: positiveMoneySchema,
  /** Net monthly income, which is what the automated limit is sized against. */
  monthlyIncome: positiveMoneySchema,
  /** Everything other lenders already take each month. */
  monthlyDebtPayments: positiveMoneySchema,
  employmentMonths: z.number().int().min(0).max(MAX_EMPLOYMENT_MONTHS),
  /**
   * An account the bank may draw on to clear the overdraft automatically.
   *
   * Optional, and off by default. A sweep that a customer did not ask for is a bank moving
   * money between their accounts without being told to.
   */
  sweepFromAccountId: entityId('acc').optional(),
});
export type RequestOverdraftRequest = z.infer<typeof requestOverdraftRequestSchema>;

/** Changing the sweep arrangement on a live facility. */
export const updateSweepRequestSchema = z.object({
  sweepFromAccountId: entityId('acc').nullable(),
});
export type UpdateSweepRequest = z.infer<typeof updateSweepRequestSchema>;

/** A facility as the customer's account page shows it. */
export const overdraftFacilitySchema = z.object({
  id: entityId('loa'),
  accountId: entityId('acc'),
  status: z.enum(OverdraftStatus),
  limit: moneySchema,
  /** What is drawn right now, as a positive amount. */
  used: moneySchema,
  /** Facility granted but not drawn. */
  available: moneySchema,
  utilisationBps: z.number().int(),
  /** Annual rate on the arranged facility, in basis points. */
  aprBps: z.number().int(),
  /** What today would cost at the current balance, if nothing changes. */
  dailyInterest: moneySchema,
  interestChargedToDate: moneySchema,
  sweepFromAccountId: z.string().nullable(),
  declineReasons: z.array(z.string()),
  requestedAt: z.iso.datetime({ offset: false }),
  decidedAt: z.iso.datetime({ offset: false }).nullable(),
});
export type OverdraftFacility = z.infer<typeof overdraftFacilitySchema>;
