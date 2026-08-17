/**
 * The cache key vocabulary.
 *
 * Keys are declared once so an invalidation can be written against a prefix and be certain it
 * catches every query underneath it. `queryKeys.accounts.all` invalidates the list and every
 * detail; `queryKeys.accounts.detail(id)` invalidates one. A key spelled inline at the call site
 * is a key that will be spelled differently at the next call site.
 */

/** Every query key the dashboard uses, grouped by the resource it reads. */
export const queryKeys = {
  session: ['session'] as const,

  accounts: {
    all: ['accounts'] as const,
    list: () => [...queryKeys.accounts.all, 'list'] as const,
    detail: (accountId: string) => [...queryKeys.accounts.all, 'detail', accountId] as const,
    balance: (accountId: string) => [...queryKeys.accounts.all, 'balance', accountId] as const,
    netWorth: () => [...queryKeys.accounts.all, 'net-worth'] as const,
  },

  transactions: {
    all: ['transactions'] as const,
    list: (filters: Readonly<Record<string, unknown>>) =>
      [...queryKeys.transactions.all, 'list', filters] as const,
    detail: (transactionId: string) =>
      [...queryKeys.transactions.all, 'detail', transactionId] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (unreadOnly: boolean) => [...queryKeys.notifications.all, 'list', unreadOnly] as const,
    preferences: () => [...queryKeys.notifications.all, 'preferences'] as const,
  },

  kyc: {
    all: ['kyc'] as const,
    status: () => [...queryKeys.kyc.all, 'status'] as const,
    documents: () => [...queryKeys.kyc.all, 'documents'] as const,
  },

  profile: ['profile'] as const,

  security: {
    all: ['security'] as const,
    devices: () => [...queryKeys.security.all, 'devices'] as const,
    sessions: () => [...queryKeys.security.all, 'sessions'] as const,
  },

  chat: {
    all: ['chat'] as const,
    conversations: () => [...queryKeys.chat.all, 'conversations'] as const,
    conversation: (conversationId: string) =>
      [...queryKeys.chat.all, 'conversation', conversationId] as const,
  },
} as const;
