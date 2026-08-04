/**
 * Cache keys for money movement and the product screens.
 *
 * `@/lib/query-keys` names the keys the shell reads — session, accounts, transactions,
 * notifications, profile, devices. This adds the rest of the customer application, in the same
 * shape and with the same rule: a key is declared once so an invalidation written against a prefix
 * is certain to catch every query beneath it.
 *
 * Filters are folded into the key rather than kept beside it, so two screens showing the same list
 * with different filters do not fight over one cache entry.
 */

/** An immutable bag of list filters, safe to use as part of a cache key. */
export type QueryFilters = Readonly<Record<string, unknown>>;

/** Every cache key used by the movement and product screens. */
export const movementKeys = {
  transfers: {
    all: ['transfers'] as const,
    list: (filters: QueryFilters) => [...movementKeys.transfers.all, 'list', filters] as const,
    detail: (transferId: string) => [...movementKeys.transfers.all, 'detail', transferId] as const,
  },

  beneficiaries: {
    all: ['beneficiaries'] as const,
    list: (filters: QueryFilters) => [...movementKeys.beneficiaries.all, 'list', filters] as const,
    detail: (payeeId: string) => [...movementKeys.beneficiaries.all, 'detail', payeeId] as const,
  },

  transferOrders: {
    all: ['transfer-orders'] as const,
    list: (filters: QueryFilters) => [...movementKeys.transferOrders.all, 'list', filters] as const,
    detail: (orderId: string) => [...movementKeys.transferOrders.all, 'detail', orderId] as const,
  },

  bulkTransfers: {
    all: ['bulk-transfers'] as const,
    detail: (batchId: string) => [...movementKeys.bulkTransfers.all, 'detail', batchId] as const,
  },

  payments: {
    all: ['payments'] as const,
    billers: (filters: QueryFilters) => [...movementKeys.payments.all, 'billers', filters] as const,
    biller: (billerId: string) => [...movementKeys.payments.all, 'biller', billerId] as const,
    billPayments: () => [...movementKeys.payments.all, 'bill-payments'] as const,
    billPayment: (paymentId: string) =>
      [...movementKeys.payments.all, 'bill-payment', paymentId] as const,
    requests: () => [...movementKeys.payments.all, 'requests'] as const,
    request: (requestId: string) => [...movementKeys.payments.all, 'request', requestId] as const,
    mandates: (filters: QueryFilters) =>
      [...movementKeys.payments.all, 'mandates', filters] as const,
  },

  cards: {
    all: ['cards'] as const,
    list: (filters: QueryFilters) => [...movementKeys.cards.all, 'list', filters] as const,
    detail: (cardId: string) => [...movementKeys.cards.all, 'detail', cardId] as const,
    transactions: (cardId: string) => [...movementKeys.cards.all, 'transactions', cardId] as const,
    authorisations: (filters: QueryFilters) =>
      [...movementKeys.cards.all, 'authorisations', filters] as const,
  },

  save: {
    all: ['save'] as const,
    goals: () => [...movementKeys.save.all, 'goals'] as const,
    goal: (goalId: string) => [...movementKeys.save.all, 'goal', goalId] as const,
    depositRates: (currency: string) =>
      [...movementKeys.save.all, 'deposit-rates', currency] as const,
    deposits: (filters: QueryFilters) => [...movementKeys.save.all, 'deposits', filters] as const,
    deposit: (depositId: string) => [...movementKeys.save.all, 'deposit', depositId] as const,
    breakQuote: (depositId: string) =>
      [...movementKeys.save.all, 'break-quote', depositId] as const,
  },

  borrow: {
    all: ['borrow'] as const,
    products: () => [...movementKeys.borrow.all, 'products'] as const,
    applications: () => [...movementKeys.borrow.all, 'applications'] as const,
    application: (applicationId: string) =>
      [...movementKeys.borrow.all, 'application', applicationId] as const,
    loans: () => [...movementKeys.borrow.all, 'loans'] as const,
    loan: (loanId: string) => [...movementKeys.borrow.all, 'loan', loanId] as const,
    schedule: (loanId: string) => [...movementKeys.borrow.all, 'schedule', loanId] as const,
    payoffQuote: (loanId: string) => [...movementKeys.borrow.all, 'payoff', loanId] as const,
  },

  fx: {
    all: ['fx'] as const,
    board: (base: string) => [...movementKeys.fx.all, 'board', base] as const,
    alerts: () => [...movementKeys.fx.all, 'alerts'] as const,
  },

  support: {
    all: ['support'] as const,
    tickets: (filters: QueryFilters) => [...movementKeys.support.all, 'tickets', filters] as const,
    ticket: (ticketId: string) => [...movementKeys.support.all, 'ticket', ticketId] as const,
    disputes: () => [...movementKeys.support.all, 'disputes'] as const,
    dispute: (disputeId: string) => [...movementKeys.support.all, 'dispute', disputeId] as const,
    fraudReports: () => [...movementKeys.support.all, 'fraud-reports'] as const,
  },
} as const;
