'use client';

/**
 * Which account the customer is looking at.
 *
 * Held in the shell rather than in each screen, because it is a property of the session, not of a
 * page: switching to the joint account on the dashboard and then opening Payments should not put
 * the customer back on the sole account and quietly pre-select it as the source of a transfer.
 *
 * `null` means "all accounts", which is a real choice and the default — a customer with four
 * accounts wants the whole picture first.
 *
 * Backed by `useSyncExternalStore` so the choice survives a reload without an effect copying
 * storage into state on every mount.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { persistentValue } from './persistent-value';

const ALL_ACCOUNTS: string | null = null;

const store = persistentValue<string | null>({
  key: 'rb.account',
  fallback: ALL_ACCOUNTS,
  parse: (raw) => (raw.length > 0 ? raw : ALL_ACCOUNTS),
  serialise: (value) => value,
});

/** The selected account, and how to change it. */
export interface SelectedAccount {
  /** The chosen account's id, or `null` for every account. */
  readonly accountId: string | null;
  readonly select: (accountId: string | null) => void;
}

const SelectedAccountContext = createContext<SelectedAccount | null>(null);

/**
 * The account currently in focus.
 *
 * @throws when called outside {@link SelectedAccountProvider}.
 */
export function useSelectedAccount(): SelectedAccount {
  const context = useContext(SelectedAccountContext);
  if (!context) {
    throw new Error('useSelectedAccount must be called inside <SelectedAccountProvider>.');
  }
  return context;
}

/** Mount inside the application shell. */
export function SelectedAccountProvider({ children }: { readonly children: ReactNode }) {
  const accountId = useSyncExternalStore(store.subscribe, store.read, store.readServer);
  const select = useCallback((next: string | null) => store.write(next), []);
  const value = useMemo<SelectedAccount>(() => ({ accountId, select }), [accountId, select]);

  return (
    <SelectedAccountContext.Provider value={value}>{children}</SelectedAccountContext.Provider>
  );
}
