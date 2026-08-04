/**
 * Destinations owned by the movement and product lane.
 *
 * `@/lib/routes` names the shell's destinations. This names the rest, in the same shape and for
 * the same reason: moving a screen should be one edit here, not a search for a string literal
 * across forty files.
 */

import type { Route } from 'next';

/**
 * Marks a path as an application route.
 *
 * `typedRoutes` narrows `Route` to the routes Next has generated types for, and those types are
 * generated from the routes on disk. During a build of this lane some of these exist and some are
 * being written, so the assertion lives here once rather than at every `<Link>`.
 */
function movementRoute(path: string): Route {
  return path as Route;
}

/** Every destination this lane serves. */
export const laneRoutes = {
  transfers: {
    index: movementRoute('/transfers'),
    detail: (transferId: string): Route => movementRoute(`/transfers/${transferId}`),
    /** Pre-fills the flow with a payee, for "pay them again". */
    toPayee: (payeeId: string): Route => movementRoute(`/transfers?payee=${payeeId}`),
  },

  payees: {
    index: movementRoute('/payees'),
    add: movementRoute('/payees/new'),
    detail: (payeeId: string): Route => movementRoute(`/payees/${payeeId}`),
  },

  scheduled: {
    index: movementRoute('/scheduled'),
    add: movementRoute('/scheduled/new'),
    bulk: movementRoute('/scheduled/bulk'),
    detail: (orderId: string): Route => movementRoute(`/scheduled/${orderId}`),
  },

  payments: {
    index: movementRoute('/payments'),
    billers: movementRoute('/payments/billers'),
    biller: (billerId: string): Route => movementRoute(`/payments/billers/${billerId}`),
    topUp: movementRoute('/payments/top-up'),
    receipts: movementRoute('/payments/receipts'),
    requests: movementRoute('/payments/requests'),
    request: (requestId: string): Route => movementRoute(`/payments/requests/${requestId}`),
    split: movementRoute('/payments/split'),
    qr: movementRoute('/payments/qr'),
    mandates: movementRoute('/payments/mandates'),
  },

  cards: {
    index: movementRoute('/cards'),
    order: movementRoute('/cards/new'),
    detail: (cardId: string): Route => movementRoute(`/cards/${cardId}`),
  },

  save: {
    index: movementRoute('/save'),
    newGoal: movementRoute('/save/goals/new'),
    goal: (goalId: string): Route => movementRoute(`/save/goals/${goalId}`),
    deposits: movementRoute('/save/deposits'),
    newDeposit: movementRoute('/save/deposits/new'),
    deposit: (depositId: string): Route => movementRoute(`/save/deposits/${depositId}`),
  },

  borrow: {
    index: movementRoute('/borrow'),
    calculator: movementRoute('/borrow/calculator'),
    apply: movementRoute('/borrow/apply'),
    applyFor: (productCode: string): Route =>
      movementRoute(`/borrow/apply?product=${encodeURIComponent(productCode)}`),
    application: (applicationId: string): Route =>
      movementRoute(`/borrow/applications/${applicationId}`),
    loan: (loanId: string): Route => movementRoute(`/borrow/loans/${loanId}`),
    overdraft: movementRoute('/borrow/overdraft'),
  },

  wallets: {
    index: movementRoute('/wallets'),
    convert: movementRoute('/wallets/convert'),
  },

  settings: {
    index: movementRoute('/settings'),
    security: movementRoute('/settings/security'),
    devices: movementRoute('/settings/devices'),
    limits: movementRoute('/settings/limits'),
    notifications: movementRoute('/settings/notifications'),
    preferences: movementRoute('/settings/preferences'),
    privacy: movementRoute('/settings/privacy'),
  },

  support: {
    index: movementRoute('/support'),
    newTicket: movementRoute('/support/new'),
    ticket: (ticketId: string): Route => movementRoute(`/support/${ticketId}`),
    disputes: movementRoute('/support/disputes'),
    newDispute: movementRoute('/support/disputes/new'),
    disputeFor: (transactionId: string): Route =>
      movementRoute(`/support/disputes/new?transaction=${transactionId}`),
    fraud: movementRoute('/support/fraud'),
  },

  notifications: movementRoute('/notifications'),
} as const;
