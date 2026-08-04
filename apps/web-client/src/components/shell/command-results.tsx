'use client';

/**
 * The palette's result list, grouped by kind.
 *
 * `listbox → group → option` is a shape ARIA defines, so the group heading is announced before its
 * first row and a customer hears "Shortcuts, Send money" rather than an undifferentiated run of
 * fourteen items.
 *
 * Built from `div`s rather than a list, because an `ul`/`li` carrying listbox roles gives assistive
 * technology two conflicting structures to reconcile: the implicit list and the explicit widget.
 */

import { cn, TEXT_STYLE } from '@reliance/ui';

import type { CommandItem } from './command-items';
import { CommandRow } from './command-row';

/** Props for {@link CommandResults}. */
export interface CommandResultsProps {
  readonly listId: string;
  readonly matches: readonly CommandItem[];
  readonly activeId: string | undefined;
  readonly query: string;
  readonly onChoose: (item: CommandItem) => void;
  readonly onHover: (id: string) => void;
}

/** Grouped results, or a short explanation when nothing matched. */
export function CommandResults(props: CommandResultsProps) {
  const { listId, matches, activeId, query, onChoose, onHover } = props;
  const groups = [...new Set(matches.map((item) => item.group))];

  if (matches.length === 0) {
    return (
      <div id={listId} role="listbox" aria-label="Results" className="mt-3">
        <p className={cn(TEXT_STYLE.caption, 'px-2 py-8 text-center')}>
          Nothing matched “{query}”. Try the name of an account, a payment or a setting.
        </p>
      </div>
    );
  }

  return (
    <div id={listId} role="listbox" aria-label="Results" className="mt-3 max-h-80 overflow-y-auto">
      {groups.map((group) => (
        <div key={group} role="group" aria-label={group}>
          <p
            aria-hidden="true"
            className="text-fg-subtle px-2 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase"
          >
            {group}
          </p>
          {matches
            .filter((item) => item.group === group)
            .map((item) => (
              <CommandRow
                key={item.id}
                id={`${listId}-${item.id}`}
                item={item}
                active={`${listId}-${item.id}` === activeId}
                onSelect={() => onChoose(item)}
                onHover={() => onHover(item.id)}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
