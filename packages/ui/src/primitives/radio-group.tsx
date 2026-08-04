/**
 * A labelled group of radios.
 *
 * `<fieldset>` + `<legend>` is the only markup that makes a screen reader announce the question
 * ("Transfer speed") before each answer ("Instant, radio button, 1 of 3"). Without it the user
 * hears three unrelated options and has to infer what is being asked.
 */

import { type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface RadioGroupProps {
  /** The question the radios answer. */
  readonly legend: ReactNode;
  /** Shared `name`, which is what binds the radios into one group for keyboard navigation. */
  readonly name: string;
  readonly orientation?: 'vertical' | 'horizontal';
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * `name` is passed by the caller onto each Radio; this component only supplies the grouping
 * semantics and layout, so a group can still mix radios with other content.
 *
 * @example
 * <RadioGroup legend="Transfer speed" name="speed">
 *   <Radio name="speed" value="instant">Instant</Radio>
 * </RadioGroup>
 */
export function RadioGroup(props: RadioGroupProps) {
  const { legend, name, orientation = 'vertical', className, children } = props;

  return (
    <fieldset data-radio-group={name} className={cn('flex flex-col gap-2 border-0 p-0', className)}>
      <legend className="font-body text-fg mb-1 text-sm font-medium">{legend}</legend>
      <div
        className={cn('flex gap-3', orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap')}
      >
        {children}
      </div>
    </fieldset>
  );
}
