'use client';

/**
 * The toast queue.
 *
 * Separated from the provider so the queue's rules — capping, auto-dismiss, timer cleanup — are
 * testable without mounting a React tree around them.
 *
 * The cap matters more than it looks: a failing request in a retry loop can fire a notification
 * per attempt, and forty stacked toasts cover the page the user is trying to fix.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { type ToastItem } from './toast.js';

/** Long enough to read a short sentence, short enough not to sit over the content. */
export const DEFAULT_TOAST_DURATION_MS = 5000;

/** Beyond this the oldest are dropped. */
export const MAX_VISIBLE_TOASTS = 4;

/** Input to `notify` — the id is generated unless the caller needs a stable one to replace. */
export type ToastInput = Omit<ToastItem, 'id'> & { readonly id?: string };

export interface ToastQueue {
  readonly toasts: readonly ToastItem[];
  readonly notify: (toast: ToastInput) => string;
  readonly dismiss: (id: string) => void;
}

/** Holds the visible toasts and the timers that retire them. */
export function useToastQueue(): ToastQueue {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (input: ToastInput): string => {
      counter.current += 1;
      const id = input.id ?? `rb-toast-${counter.current}`;
      const duration = input.duration ?? DEFAULT_TOAST_DURATION_MS;

      setToasts((current) => [...current, { ...input, id }].slice(-MAX_VISIBLE_TOASTS));
      if (duration > 0)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );

      return id;
    },
    [dismiss],
  );

  // Timers outlive the tree unless they are cancelled, and a stray one fires `setState` on a
  // provider that has already gone — harmless today, a leak in a long-lived admin session.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { toasts, notify, dismiss };
}
