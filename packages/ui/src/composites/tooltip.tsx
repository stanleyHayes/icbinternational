'use client';

/**
 * The Tooltip — a short clarification attached to a control.
 *
 * A tooltip is a *supplement*, never the only place information exists: it is unreachable by
 * touch and easy to miss, so "Available balance excludes pending card authorisations" can live
 * here, but "Enter an amount" cannot.
 *
 * Opens on hover *and* on focus, which is the pair that makes it work for a keyboard user, and
 * closes on Escape without closing anything else.
 */

import { useId, useState, type ReactElement, type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export type TooltipSide = 'top' | 'bottom';

const SIDE: Readonly<Record<TooltipSide, string>> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 -translate-y-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 translate-y-2',
};

const ESCAPE = 'Escape';

export interface TooltipProps {
  /** The tip. Keep it to one sentence — this is a hint, not documentation. */
  readonly content: ReactNode;
  readonly side?: TooltipSide;
  readonly className?: string;
  /**
   * The trigger. Receives `aria-describedby`, so it must be an element that forwards props to a
   * real DOM node — a Button, an icon button, a link.
   */
  readonly children: ReactElement<{ 'aria-describedby'?: string }>;
}

/**
 * @example
 * <Tooltip content="Excludes pending card authorisations">
 *   <button type="button" aria-label="About available balance"><InfoIcon /></button>
 * </Tooltip>
 */
export function Tooltip({ content, side = 'top', className, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    // The wrapper is a positioning context, not a control: the interactive element is the child
    // it wraps. Escape is bound here because WCAG 1.4.13 requires hoverable content to be
    // dismissable without moving the pointer, and the wrapper is where the hover lives.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === ESCAPE) setOpen(false);
      }}
    >
      {/* `aria-describedby` rather than `aria-labelledby`: the trigger already has a name, and
          replacing it with the tip loses the name the user needs to operate the control. */}
      <span aria-describedby={open ? id : undefined} className="contents">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        // Kept mounted and hidden rather than unmounted, so a screen reader that resolves
        // `aria-describedby` on focus finds the text already in the accessibility tree.
        hidden={!open}
        className={cn(
          'bg-surface-inverse absolute z-40 w-max max-w-xs rounded-sm px-2 py-1',
          'font-body text-fg-inverse text-xs shadow-md',
          SIDE[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
