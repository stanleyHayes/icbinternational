'use client';

/**
 * One row of the command palette.
 *
 * A `button` carrying `role="option"` and `tabIndex={-1}`. The role is what the listbox pattern
 * needs; the negative tab index keeps it out of the tab order, because the combobox input holds
 * focus and moves the highlight with `aria-activedescendant`. Using a bare `div` instead would
 * leave the row unreachable by any keyboard path at all.
 */

import { cn } from '@reliance/ui';

import type { CommandItem } from './command-items';

/** Props for {@link CommandRow}. */
export interface CommandRowProps {
  /** Must match what the combobox points `aria-activedescendant` at. */
  readonly id: string;
  readonly item: CommandItem;
  readonly active: boolean;
  readonly onSelect: () => void;
  /** Highlights the row as the pointer passes over it, keeping mouse and keyboard in step. */
  readonly onHover: () => void;
}

/** A destination or action, as the palette lists it. */
export function CommandRow({ id, item, active, onSelect, onHover }: CommandRowProps) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={active}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left',
        active ? 'bg-accent-soft text-fg' : 'text-fg-muted',
      )}
    >
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', active && 'text-accent')} />
      <span className="min-w-0 flex-1">
        <span className="text-fg block truncate text-sm font-medium">{item.label}</span>
        <span className="text-fg-subtle block truncate text-xs">{item.hint}</span>
      </span>
    </button>
  );
}
