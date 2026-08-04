/**
 * Class-name composition for the design system.
 *
 * `clsx` resolves conditionals; `tailwind-merge` resolves *conflicts*. Without the merge step a
 * caller's `className="px-6"` loses to a component's built-in `px-4` on a coin toss of source
 * order, which is the single most common reason a component library becomes un-overridable.
 */

import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

export type { ClassValue };

/**
 * The brand type scale replaces Tailwind's default one, so `tailwind-merge` has to be told which
 * `text-*` names are sizes. Without this it treats `text-4xl` as an unknown class and lets both
 * `text-base` and `text-4xl` survive a merge.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'] }],
      shadow: [{ shadow: ['xs', 'sm', 'md', 'lg', 'card'] }],
      rounded: [{ rounded: ['sm', 'md', 'lg', 'xl', '2xl', 'pill'] }],
    },
  },
});

/**
 * Joins conditional class names and resolves Tailwind conflicts, last value winning.
 *
 * @example cn('px-4 text-fg', isActive && 'text-accent', props.className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
