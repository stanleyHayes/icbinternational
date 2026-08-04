'use client';

/**
 * The multi-line text input.
 *
 * Used for payment references, support messages and dispute descriptions — all of which have
 * server-side length limits, so the optional counter is part of the control rather than something
 * each screen re-invents next to it.
 */

import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { DISABLED, FIELD_BASE, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';

const DEFAULT_ROWS = 4;

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Shows a live `used / maxLength` counter. Requires `maxLength` and a controlled `value`,
   * because counting characters the component cannot see is guesswork.
   */
  readonly showCount?: boolean;
}

/**
 * @example <Textarea maxLength={140} showCount value={reference} onChange={onChange} />
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, showCount = false, rows = DEFAULT_ROWS, ...props },
  ref,
) {
  const field = useFieldControl();
  const { maxLength, value } = props;
  const used = typeof value === 'string' ? value.length : 0;

  return (
    <div className="flex flex-col gap-1">
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          FIELD_BASE,
          'resize-y py-2 text-base leading-relaxed',
          FOCUS_RING,
          TRANSITION_STATE,
          DISABLED,
          className,
        )}
        {...field}
        {...props}
      />
      {showCount && maxLength !== undefined && (
        // `aria-live` is deliberately absent: announcing every keystroke's remaining count is
        // unusable. The `maxlength` attribute already enforces the limit.
        <span className="font-body text-fg-subtle self-end text-xs">
          {used} / {maxLength}
        </span>
      )}
    </div>
  );
});
