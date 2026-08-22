import type { ReactNode } from 'react';

import { cn } from '@reliance/ui';

/**
 * The small label that names a section above its heading.
 *
 * It used to be set in accent green, uppercased, at `text-xs` with `tracking-widest` —
 * the default eyebrow of every template on the internet, and the reason the page read as
 * generated rather than designed. Two problems with it, beyond the familiarity: uppercasing
 * a phrase like "How we lend" throws away the word shapes a reader navigates by, and
 * spending the accent colour on 68 decorative labels leaves it meaning nothing by the time
 * it reaches a button or a published rate.
 *
 * So the label is set in the words the author wrote, in muted ink, and the structure is
 * carried by a rule instead of by colour — a section mark, which is what an eyebrow
 * actually is. The accent is now reserved for things a customer can act on or is being
 * quoted.
 */
export function Eyebrow({
  children,
  align = 'start',
}: {
  readonly children: ReactNode;
  readonly align?: 'start' | 'center';
}) {
  return (
    <p
      className={cn(
        'text-fg-muted flex items-center gap-3 text-sm',
        align === 'center' && 'justify-center',
      )}
    >
      <span aria-hidden className="bg-border-strong h-px w-6 shrink-0" />
      {children}
    </p>
  );
}
