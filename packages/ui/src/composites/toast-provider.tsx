'use client';

/**
 * The toast region.
 *
 * One region, mounted once, holding every toast — because a screen reader only watches live
 * regions that already existed when the change happened. Creating a fresh container per
 * notification is the classic reason toasts are announced visually and nowhere else.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { Toast } from './toast.js';
import { useToastQueue, type ToastInput } from './use-toast-queue.js';

export interface ToastApi {
  /** Queues a notification and returns its id. */
  readonly notify: (toast: ToastInput) => string;
  readonly dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * @throws when called outside a ToastProvider.
 * @example useToast().notify({ tone: 'success', title: 'Payee added' });
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be called inside <ToastProvider>.');
  return context;
}

export interface ToastProviderProps {
  readonly children: ReactNode;
}

/** Mount once, near the root of the app. */
export function ToastProvider({ children }: ToastProviderProps) {
  const { toasts, notify, dismiss } = useToastQueue();
  const api = useMemo<ToastApi>(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // `log` is the role for a running list of chronological messages, and unlike a bare div
        // it is allowed to carry a name. `polite` is explicit: a confirmation waits for a gap in
        // speech rather than cutting across whatever the user was reading.
        role="log"
        aria-live="polite"
        aria-label="Notifications"
        className={
          'pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 ' +
          'p-4 sm:items-end'
        }
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
