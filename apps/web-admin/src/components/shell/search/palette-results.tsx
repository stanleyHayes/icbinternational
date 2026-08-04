/**
 * The palette's result list.
 *
 * A real listbox — grouped `role="option"` rows the input points at with
 * `aria-activedescendant` — rather than a list of links. Focus stays in the text field
 * the whole time, which is what makes the type-then-arrow-then-Enter rhythm work; moving
 * focus onto each row would mean the operator could no longer keep typing to narrow the
 * list. Each row is still a real button so a pointer user gets a proper click target.
 */

'use client';

import { cn } from '@reliance/ui';

import { groupResults, type SearchResult } from './search-result';

const GROUP_HEADING =
  'px-3 pt-3 pb-1 font-body text-xs font-semibold uppercase tracking-wider text-fg-subtle';

const ROW = 'flex w-full items-center gap-3 px-3 py-1.5 text-left';
const ROW_ACTIVE = 'bg-accent-soft';

export interface PaletteResultsProps {
  readonly listId: string;
  readonly results: readonly SearchResult[];
  /** Position of each result in the keyboard order, keyed by {@link SearchResult.key}. */
  readonly indexByKey: ReadonlyMap<string, number>;
  readonly activeIndex: number;
  readonly onChoose: (result: SearchResult) => void;
}

/** Grouped, keyboard-addressable results. */
export function PaletteResults(props: PaletteResultsProps) {
  const { listId, results, indexByKey, activeIndex, onChoose } = props;

  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Search results"
      className="border-border max-h-96 overflow-y-auto border-t"
    >
      {groupResults(results).map(([group, items]) => (
        <div key={group} role="group" aria-label={group}>
          <p aria-hidden="true" className={GROUP_HEADING}>
            {group}
          </p>
          {items.map((result) => (
            <PaletteRow
              key={result.key}
              listId={listId}
              result={result}
              index={indexByKey.get(result.key) ?? -1}
              active={indexByKey.get(result.key) === activeIndex}
              onChoose={onChoose}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface PaletteRowProps {
  readonly listId: string;
  readonly result: SearchResult;
  readonly index: number;
  readonly active: boolean;
  readonly onChoose: (result: SearchResult) => void;
}

function PaletteRow({ listId, result, index, active, onChoose }: PaletteRowProps) {
  const Icon = result.icon;

  return (
    <button
      type="button"
      role="option"
      id={`${listId}-option-${index}`}
      aria-selected={active}
      // Out of the tab order on purpose: the input owns focus and points here with
      // `aria-activedescendant`, which is the pattern a listbox is meant to use.
      tabIndex={-1}
      onClick={() => onChoose(result)}
      className={cn(ROW, active && ROW_ACTIVE)}
    >
      <Icon aria-hidden="true" className="text-fg-subtle size-4 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="font-body text-fg truncate text-sm font-medium">{result.title}</span>
        <span className="font-body text-fg-muted truncate text-xs">{result.detail}</span>
      </span>
    </button>
  );
}
