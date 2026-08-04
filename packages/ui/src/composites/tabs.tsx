'use client';

/**
 * Tabs, to the WAI-ARIA tabs pattern.
 *
 * The part that is always missing from a hand-rolled tab strip is the keyboard model: exactly one
 * tab is in the page's tab order (roving `tabindex`), and the arrow keys move between them. Tab
 * should take you *out* of the strip and into the panel, not walk you through nine filters.
 *
 * Activation follows focus, which is correct while the panels are already rendered. A tab whose
 * panel triggers a network request should be a link to a route instead.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { FOCUS_RING_INSET, TRANSITION_STATE } from '../foundation/styles.js';
import { useControllableState } from '../hooks/use-controllable-state.js';
import { cn } from '../lib/cn.js';

import {
  panelDomId,
  tabDomId,
  TabsProvider,
  useTabsContext,
  type TabsOrientation,
} from './tabs-context.js';

const TAB_SELECTOR = '[role="tab"]:not([disabled])';

/** Arrow keys wrap; Home and End jump to the ends. Returns -1 when the key is not ours. */
function nextTabIndex(key: string, current: number, count: number): number {
  const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const delta = step[key];
  return delta === undefined ? -1 : (current + delta + count) % count;
}

export interface TabsProps {
  readonly value?: string;
  readonly defaultValue: string;
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: TabsOrientation;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * @example
 * <Tabs defaultValue="activity">
 *   <TabList label="Account sections">
 *     <Tab value="activity">Activity</Tab>
 *   </TabList>
 *   <TabPanel value="activity">…</TabPanel>
 * </Tabs>
 */
export function Tabs(props: TabsProps) {
  const { orientation = 'horizontal', className, children } = props;
  const baseId = useId();
  const [value, setValue] = useControllableState<string>({
    value: props.value,
    defaultValue: props.defaultValue,
    onChange: props.onValueChange,
  });

  return (
    <TabsProvider value={{ baseId, value, setValue, orientation }}>
      <div
        className={cn(
          'flex',
          orientation === 'vertical' ? 'flex-row gap-6' : 'flex-col',
          className,
        )}
      >
        {children}
      </div>
    </TabsProvider>
  );
}

export interface TabListProps {
  /** Accessible name for the strip — "Account sections", not "Tabs". */
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/** The strip. Owns arrow-key navigation for the tabs inside it. */
export function TabList({ label, className, children }: TabListProps) {
  const { orientation } = useTabsContext();
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const tabs = [...(list.current?.querySelectorAll<HTMLElement>(TAB_SELECTOR) ?? [])];
    const index = nextTabIndex(
      event.key,
      tabs.indexOf(document.activeElement as HTMLElement),
      tabs.length,
    );
    if (index < 0 || tabs.length === 0) return;
    event.preventDefault();
    tabs[index]?.focus();
    tabs[index]?.click();
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      // A tablist handles arrow keys, so it is interactive and must be reachable. -1
      // keeps it out of the Tab sequence — the selected tab owns that stop — while
      // still allowing programmatic focus and satisfying the interactive-role contract.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-1',
        orientation === 'vertical'
          ? 'border-border flex-col border-r pr-2'
          : 'border-border border-b',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface TabProps {
  readonly value: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/** One tab. Selected state is expressed by `aria-selected`, not by colour alone. */
export function Tab({ value, disabled, className, children }: TabProps) {
  const { baseId, value: active, setValue, orientation } = useTabsContext();
  const selected = value === active;

  return (
    <button
      type="button"
      role="tab"
      id={tabDomId(baseId, value)}
      aria-selected={selected}
      aria-controls={panelDomId(baseId, value)}
      // Roving tabindex: only the selected tab is reachable with Tab, the rest with the arrows.
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        'font-body relative -mb-px px-4 py-2 text-sm font-medium whitespace-nowrap',
        'text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60',
        selected && 'text-fg',
        selected &&
          (orientation === 'vertical' ? 'border-accent border-r-2' : 'border-accent border-b-2'),
        FOCUS_RING_INSET,
        TRANSITION_STATE,
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface TabPanelProps {
  readonly value: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * The panel.
 *
 * Kept mounted and `hidden` rather than unmounted. Unmounting looks tidier but breaks the pattern
 * it is part of: every tab carries `aria-controls`, and a tab pointing at an element that is not
 * in the DOM is an invalid reference that assistive tech — and axe — will reject. `hidden` removes
 * the panel from the accessibility tree and from the tab order just as thoroughly.
 *
 * A panel whose content is expensive to render should be a route, not a tab.
 */
export function TabPanel({ value, className, children }: TabPanelProps) {
  const { baseId, value: active } = useTabsContext();

  return (
    <div
      role="tabpanel"
      id={panelDomId(baseId, value)}
      aria-labelledby={tabDomId(baseId, value)}
      hidden={value !== active}
      // Focusable so Tab moves from the strip into the panel, which is where the content
      // is. WAI-ARIA requires this for a tabpanel with no focusable child; the linter's
      // non-interactive-tabindex rule does not model that exception.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className={cn('pt-4 outline-none', className)}
    >
      {children}
    </div>
  );
}
