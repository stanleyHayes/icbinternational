'use client';

/**
 * Re-authentication for a sensitive action.
 *
 * Exposed as a promise so a caller reads the way the requirement does:
 *
 * ```ts
 * const token = await stepUp.authorise('reveal your card number');
 * await api.cards.sensitive(cardId, withStepUpToken(token));
 * ```
 *
 * The grant is returned, never stored. It belongs in the header of the one call it authorises; a
 * token kept in a context would end up attached to everything until it expired, which is the whole
 * thing step-up exists to prevent.
 *
 * Cancelling rejects with {@link StepUpCancelled}, so a caller can abandon quietly rather than
 * showing an error for something the customer chose.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { StepUpDialog } from './step-up-dialog';

/** Thrown when the customer dismisses the step-up prompt. Not a failure — a decision. */
export class StepUpCancelled extends Error {
  constructor() {
    super('Confirmation was cancelled.');
    this.name = 'StepUpCancelled';
  }
}

/** Asking the customer to prove it is them. */
export interface StepUpApi {
  /**
   * @param reason what the confirmation is for, in the second person: `'reveal your card number'`.
   * @returns the grant token, valid for one call and a short window.
   */
  readonly authorise: (reason: string) => Promise<string>;
}

const StepUpContext = createContext<StepUpApi | null>(null);

/**
 * The step-up prompt.
 *
 * @throws when called outside {@link StepUpProvider}.
 */
export function useStepUp(): StepUpApi {
  const context = useContext(StepUpContext);
  if (!context) throw new Error('useStepUp must be called inside <StepUpProvider>.');
  return context;
}

interface Pending {
  readonly resolve: (token: string) => void;
  readonly reject: (error: Error) => void;
}

/** Mount inside the application shell. */
export function StepUpProvider({ children }: { readonly children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);

  const settle = useCallback((outcome: { readonly token?: string }) => {
    const waiting = pending.current;
    pending.current = null;
    setReason(null);
    if (!waiting) return;
    if (outcome.token) waiting.resolve(outcome.token);
    else waiting.reject(new StepUpCancelled());
  }, []);

  const authorise = useCallback(
    (nextReason: string) =>
      new Promise<string>((resolve, reject) => {
        // A second request while one is open is a bug in the caller, not something to queue.
        pending.current?.reject(new StepUpCancelled());
        pending.current = { resolve, reject };
        setReason(nextReason);
      }),
    [],
  );

  const api = useMemo<StepUpApi>(() => ({ authorise }), [authorise]);

  return (
    <StepUpContext.Provider value={api}>
      {children}
      <StepUpDialog
        reason={reason}
        onCancel={() => settle({})}
        onGranted={(token) => settle({ token })}
      />
    </StepUpContext.Provider>
  );
}
