/**
 * The inline validation message.
 *
 * `role="alert"` so it is announced the moment it appears. A rejected payment amount that is only
 * visible — red text under a field the user has already tabbed past — is not a rejection anyone
 * receives. Renders nothing when there is no message, so callers can pass a possibly-undefined
 * error straight through without a conditional at every call site.
 */

import { type HTMLAttributes } from 'react';

import { AlertTriangleIcon } from '../foundation/icons.js';
import { cn } from '../lib/cn.js';

import { useFieldContext } from './field-context.js';

export interface FieldErrorProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> {
  /** The message. Falsy renders nothing. */
  readonly children?: string | false | null;
}

/**
 * @example <FieldError>{errors.amount?.message}</FieldError>
 */
export function FieldError({ className, children, id, ...props }: Readonly<FieldErrorProps>) {
  const field = useFieldContext();

  if (!children) return null;

  return (
    <p
      id={id ?? field?.errorId}
      role="alert"
      className={cn('font-body text-danger flex items-start gap-1.5 text-sm', className)}
      {...props}
    >
      <AlertTriangleIcon className="mt-0.5 size-4" />
      <span>{children}</span>
    </p>
  );
}
