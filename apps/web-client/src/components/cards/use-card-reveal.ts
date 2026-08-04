'use client';

/**
 * Showing a card number, and taking it away again.
 *
 * The rules this hook exists to keep, all of which are easy to break by accident:
 *
 * - **Step-up every time.** The grant is fetched for this one call and never stored, so revealing
 *   twice means confirming twice. A token cached "for convenience" is a PAN behind a stale
 *   authentication.
 * - **Never cached.** The details live in component state, not in the query cache, so nothing
 *   persists them, devtools do not show them and a back-navigation does not resurrect them.
 * - **Gone after thirty seconds.** A phone left face-up on a desk is the threat model. The
 *   countdown is visible so the disappearance is expected rather than a bug.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CardSensitiveDetails } from '@reliance/contracts';

import { StepUpCancelled, useStepUp } from '@/components/shell';
import { browserApi } from '@/lib/api';

/** How long the details stay on screen. */
export const REVEAL_SECONDS = 30;

const MS_PER_SECOND = 1000;
const STEP_UP_REASON = 'see your full card details';

/** What {@link useCardReveal} hands the panel. */
export interface CardReveal {
  /** The one-shot payload, or `null` when nothing is on screen. */
  readonly details: CardSensitiveDetails['data'] | null;
  /**
   * True once a reveal has succeeded in this panel's lifetime.
   *
   * It is the difference between "nothing has been shown yet" and "what was shown has gone",
   * which look identical from `details` alone and have to be announced differently.
   */
  readonly hasRevealed: boolean;
  readonly secondsLeft: number;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reveal: () => void;
  readonly hide: () => void;
}

/** @param cardId the card whose details are being asked for. */
export function useCardReveal(cardId: string): CardReveal {
  const stepUp = useStepUp();
  const [details, setDetails] = useState<CardSensitiveDetails['data'] | null>(null);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setDetails(null);
    setSecondsLeft(0);
  }, []);

  // Anything on screen goes with the component. Unmounting is not a reason to keep a PAN alive.
  useEffect(() => hide, [hide]);

  const reveal = useCallback(async (): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const token = await stepUp.authorise(STEP_UP_REASON);
      const payload = await browserApi().cards.sensitiveDetails(cardId, token);
      setDetails(payload.data);
      setHasRevealed(true);
      setSecondsLeft(REVEAL_SECONDS);
      timer.current = startCountdown(setSecondsLeft, hide);
    } catch (failure) {
      if (!(failure instanceof StepUpCancelled)) setError(failure);
    } finally {
      setLoading(false);
    }
  }, [cardId, hide, stepUp]);

  return { details, hasRevealed, secondsLeft, loading, error, reveal: () => void reveal(), hide };
}

/** Counts the reveal down and hides it when it reaches zero. */
function startCountdown(
  setSecondsLeft: (update: (remaining: number) => number) => void,
  hide: () => void,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    setSecondsLeft((remaining) => {
      if (remaining > 1) return remaining - 1;
      hide();
      return 0;
    });
  }, MS_PER_SECOND);
}
