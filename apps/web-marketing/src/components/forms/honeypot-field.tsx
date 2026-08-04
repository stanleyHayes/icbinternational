'use client';

import { useId } from 'react';

/**
 * The honeypot.
 *
 * A field a person never sees and a form-filling script cannot resist. It is hidden with
 * CSS rather than `type="hidden"` — a hidden input is the one thing a bot knows to leave
 * alone — and carries `tabIndex={-1}`, `aria-hidden` and `autoComplete="off"` so a
 * keyboard user never lands in it and a screen reader never announces it.
 *
 * The `name` is fixed by the contract; the `id` is generated, because the contact page
 * renders two forms and a duplicate id makes both labels point at the same input.
 *
 * It is a filter, not a defence. Server-side rate limiting is the defence.
 */
export function HoneypotField() {
  const id = useId();

  return (
    <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden" data-honeypot>
      <label htmlFor={id}>Website</label>
      <input id={id} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
