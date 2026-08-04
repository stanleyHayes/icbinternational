/**
 * Request shapes the frozen contract does not name.
 *
 * `packages/contracts` defines the dispute and the body that raises one. It does not
 * define the *query* on either list, the evidence body, or the decision body — the routes
 * exist and `packages/api-client` already calls them, so the schemas have to exist too.
 *
 * They are built from the contract's own primitives rather than reinvented, so a document
 * id is validated the same way here as everywhere else, and they live in the API because
 * inventing shapes inside a frozen package is how a contract stops being frozen.
 */

import { z } from 'zod';

import {
  cursorQuerySchema,
  DisputeStatus,
  entityId,
  mediumTextSchema,
  shortTextSchema,
} from '@reliance/contracts';

import { MAX_EVIDENCE_IDS } from './disputes.constants.js';

/** Filters on the customer's dispute list and on the operations queue. */
export const listDisputesQuerySchema = cursorQuerySchema.extend({
  status: z.enum(DisputeStatus).optional(),
});
export type ListDisputesQuery = z.infer<typeof listDisputesQuerySchema>;

/**
 * Documents attached to a case after it was raised.
 *
 * At least one id, because an empty upload is a no-op that would still push a step onto
 * the timeline and tell the customer something happened.
 */
export const addDisputeEvidenceRequestSchema = z.object({
  evidenceIds: z.array(entityId('doc')).min(1).max(MAX_EVIDENCE_IDS),
  note: shortTextSchema.optional(),
});
export type AddDisputeEvidenceRequest = z.infer<typeof addDisputeEvidenceRequestSchema>;

/**
 * An investigator's decision on a case.
 *
 * `outcomeSummary` is required rather than optional: it is the explanation the customer
 * is sent and the one the bank answers a complaint with, and a decision nobody wrote a
 * reason for is a decision nobody can defend.
 *
 * `reverseProvisionalCredit` defaults to true, so a case lost without an explicit
 * instruction takes the provisional credit back. Leaving money with the customer is the
 * bank absorbing a loss, and that should have to be asked for.
 */
export const decideDisputeRequestSchema = z.object({
  outcome: z.enum([DisputeStatus.WON, DisputeStatus.LOST, DisputeStatus.WITHDRAWN]),
  outcomeSummary: mediumTextSchema,
  reverseProvisionalCredit: z.boolean().default(true),
});
export type DecideDisputeRequest = z.infer<typeof decideDisputeRequestSchema>;
