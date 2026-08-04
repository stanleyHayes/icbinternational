/**
 * Debit cards: issuing, lifecycle, controls and authorisations.
 *
 * `sensitiveDetails` is the only method in the whole client that returns a PAN, and it
 * demands a step-up token by construction — the parameter is required, not optional, so
 * a caller cannot reach the endpoint without having re-authenticated the user first.
 */

import type { z } from 'zod';

import {
  type activateCardRequestSchema,
  cardAuthorisationSchema,
  cardSchema,
  cardSensitiveDetailsSchema,
  paginated,
  resource,
  routes,
  transactionSchema,
  type AuthorisationStatus,
  type Card,
  type CardAuthorisation,
  type CardControls,
  type CardSensitiveDetails,
  type CardStatus,
  type CursorQuery,
  type IssueCardRequest,
  type Paginated,
  type Resource,
  type ReportCardRequest,
  type Transaction,
} from '@reliance/contracts';

import { withIdempotencyKey, withStepUpToken } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const cardList = paginated(cardSchema);
const cardResource = resource(cardSchema);
const authorisationList = paginated(cardAuthorisationSchema);
const transactionList = paginated(transactionSchema);

type ActivateCardRequest = z.infer<typeof activateCardRequestSchema>;
type SetCardPinRequest = { readonly pin: string };

/** Filters for the card list. */
export type ListCardsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly accountId?: string | undefined;
  readonly status?: CardStatus | undefined;
};

/** Filters for the authorisation feed. */
export type ListAuthorisationsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly cardId?: string | undefined;
  readonly status?: AuthorisationStatus | undefined;
};

/** Body of a card rename or default-card change. */
export interface UpdateCardRequest {
  readonly nickname?: string | null;
  readonly isDefault?: boolean;
}

type Controls = z.infer<typeof cardSchema>['controls'];

/** Builds the `client.cards` group. */
export function createCardsResource(http: HttpTransport) {
  return {
    /** The customer's cards. */
    list: (query?: ListCardsQuery, options?: QueryOptions): Promise<Paginated<Card>> =>
      http.get({ ...options, path: routes.cards.list, query, schema: cardList }),

    /** Issues a card. Virtual cards are usable immediately; physical ones are posted. */
    issue: (body: IssueCardRequest, options?: MutationOptions): Promise<Resource<Card>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.cards.create,
        body,
        schema: cardResource,
      }),

    /** One card. Never includes the PAN — see `sensitiveDetails`. */
    get: (id: string, options?: QueryOptions): Promise<Resource<Card>> =>
      http.get({ ...options, path: routes.cards.byId(id), schema: cardResource }),

    /** Renames a card or makes it the default. */
    update: (
      id: string,
      body: UpdateCardRequest,
      options?: MutationOptions,
    ): Promise<Resource<Card>> =>
      http.patch({ ...options, path: routes.cards.byId(id), body, schema: cardResource }),

    /** Cancels a card permanently. Use `freeze` for anything reversible. */
    cancel: (id: string, options?: MutationOptions): Promise<Resource<Card>> =>
      http.delete({ ...options, path: routes.cards.byId(id), schema: cardResource }),

    /** Activates a delivered card using its last four digits and a chosen PIN. */
    activate: (
      id: string,
      body: ActivateCardRequest,
      options?: MutationOptions,
    ): Promise<Resource<Card>> =>
      http.post({ ...options, path: routes.cards.activate(id), body, schema: cardResource }),

    /** Freezes a card. Reversible, instant, and the right answer to "where is my card?". */
    freeze: (id: string, options?: MutationOptions): Promise<Resource<Card>> =>
      http.post({ ...options, path: routes.cards.freeze(id), schema: cardResource }),

    /** Unfreezes a card. */
    unfreeze: (id: string, options?: MutationOptions): Promise<Resource<Card>> =>
      http.post({ ...options, path: routes.cards.unfreeze(id), schema: cardResource }),

    /**
     * The full PAN, CVV and expiry, valid for a few seconds.
     *
     * The step-up token is a required argument rather than an option: this is the one
     * response in the client that must never be logged, cached or persisted, and making
     * re-authentication impossible to forget is the cheapest guard available.
     */
    sensitiveDetails: (
      id: string,
      stepUpToken: string,
      options?: MutationOptions,
    ): Promise<CardSensitiveDetails> =>
      http.post({
        ...withStepUpToken(stepUpToken, options),
        path: routes.cards.sensitive(id),
        schema: cardSensitiveDetailsSchema,
      }),

    /** Sets or changes the card PIN. */
    setPin: (
      id: string,
      body: SetCardPinRequest,
      options?: MutationOptions,
    ): Promise<Resource<Card>> =>
      http.put({ ...options, path: routes.cards.pin(id), body, schema: cardResource }),

    /** Replaces the card's channel switches and limits wholesale. */
    setControls: (
      id: string,
      body: CardControls,
      options?: MutationOptions,
    ): Promise<Resource<Card>> =>
      http.put({ ...options, path: routes.cards.controls(id), body, schema: cardResource }),

    /** Current controls for a card. */
    getControls: (id: string, options?: QueryOptions): Promise<Resource<Controls>> =>
      http.get({
        ...options,
        path: routes.cards.controls(id),
        schema: resource(cardSchema.shape.controls),
      }),

    /** Reports a card lost, stolen or damaged, ordering a replacement by default. */
    report: (
      id: string,
      body: ReportCardRequest,
      options?: MutationOptions,
    ): Promise<Resource<Card>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.cards.report(id),
        body,
        schema: cardResource,
      }),

    /** Transactions made on one card. */
    transactions: (
      id: string,
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Transaction>> =>
      http.get({
        ...options,
        path: routes.cards.transactions(id),
        query,
        schema: transactionList,
      }),

    /**
     * The authorisation feed — approvals *and* declines.
     *
     * Declines are the useful half. "Why was my card refused?" is answerable only if the
     * client can show the decline reason, so they are first-class rows here rather than
     * being filtered out as noise.
     */
    authorisations: (
      query?: ListAuthorisationsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<CardAuthorisation>> =>
      http.get({
        ...options,
        path: routes.cards.authorisations,
        query,
        schema: authorisationList,
      }),
  };
}

/** The `client.cards` group. */
export type CardsResource = ReturnType<typeof createCardsResource>;
