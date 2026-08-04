'use client';

/**
 * Copying a reference, an IBAN or a share link.
 *
 * The confirmation is announced, not just drawn. A tick that appears silently tells a sighted
 * user the copy worked and tells a screen-reader user nothing, on exactly the sort of value —
 * an account number being read out over the phone — where "did that work?" matters.
 *
 * Reverts after a few seconds so the control does not sit permanently in its success state.
 */

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@reliance/ui';

const CONFIRMATION_MS = 2500;

/** Props for {@link CopyButton}. */
export interface CopyButtonProps {
  /** The exact text placed on the clipboard. */
  readonly value: string;
  /** What is being copied — "payment reference". Used in the accessible name. */
  readonly subject: string;
  /** Renders label text beside the icon. Off by default, for use inside dense rows. */
  readonly withLabel?: boolean;
}

/**
 * @example <CopyButton value={transfer.railReference} subject="payment reference" />
 */
/**
 * Writes to the clipboard and shows a confirmation that clears itself.
 *
 * The timer is cleared on unmount and before each new copy, so a component that is closed
 * mid-confirmation does not set state on an unmounted tree, and two quick copies do not
 * leave the first one's timer to cancel the second one's tick.
 */
function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), CONFIRMATION_MS);
    } catch {
      // A clipboard the browser refuses is not something the customer can fix, and the value is
      // on screen to be selected by hand. Saying nothing is better than an error they cannot act on.
      setCopied(false);
    }
  };

  return { copied, copy };
}

export function CopyButton({ value, subject, withLabel = false }: CopyButtonProps) {
  const { copied, copy } = useCopy(value);

  const icon = copied ? (
    <Check aria-hidden="true" className="text-credit size-4" />
  ) : (
    <Copy aria-hidden="true" className="size-4" />
  );
  const text = copied ? 'Copied' : 'Copy';

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        iconOnly={!withLabel}
        aria-label={copied ? `${subject} copied` : `Copy ${subject}`}
        onClick={() => void copy()}
        startIcon={icon}
      >
        {withLabel ? text : null}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${subject} copied to the clipboard` : ''}
      </span>
    </>
  );
}
