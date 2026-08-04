'use client';

/**
 * A value the customer needs to give somebody else — an IBAN, a sort code, an account number.
 *
 * Copying is the whole point, so the control is a real button with a name that says what it
 * copies ("Copy IBAN"), not a bare icon. Confirmation is announced through a live region as well
 * as shown, because "did that work?" is the entire question and a tick that only exists visually
 * answers it for some people and not others.
 *
 * The value is rendered in the grouped, readable form and copied in the *unspaced* form, which is
 * what a payment form will accept. Copying "GB29 RELI 4030" into a field that strips nothing is
 * how a transfer gets rejected.
 */

import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button, cn } from '@reliance/ui';

/** How long the confirmation stays on screen. */
const CONFIRMATION_MS = 2500;

/** Props for {@link CopyValue}. */
export interface CopyValueProps {
  /** What the value is, used in the button's accessible name: "Copy IBAN". */
  readonly label: string;
  /** The value as the customer should read it — grouped and spaced. */
  readonly display: string;
  /** The value as a machine should receive it. Defaults to {@link display}. */
  readonly value?: string;
  readonly className?: string;
}

/**
 * @example <CopyValue label="IBAN" display="GB29 RELI 4030 8012 3456 78" value="GB29RELI40308012345678" />
 */
/** A flag that turns itself off again, so the confirmation does not sit there forever. */
function useTransientFlag(): readonly [boolean, () => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!on) return;
    const timer = globalThis.setTimeout(() => setOn(false), CONFIRMATION_MS);
    return () => globalThis.clearTimeout(timer);
  }, [on]);

  return [on, useCallback(() => setOn(true), [])];
}

export function CopyValue({ label, display, value, className }: CopyValueProps) {
  const [copied, confirm] = useTransientFlag();

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value ?? display);
      confirm();
    } catch {
      // Clipboard access can be refused by the browser or the operating system. The value is
      // already on screen and selectable, so the honest response is to leave it there rather
      // than raise an error about a convenience the customer can work around.
    }
  }, [confirm, display, value]);

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-fg font-mono text-sm break-all">{display}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          copy();
        }}
        aria-label={`Copy ${label}`}
        startIcon={
          copied ? (
            <Check aria-hidden="true" className="text-credit size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )
        }
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied to your clipboard` : ''}
      </span>
    </span>
  );
}
