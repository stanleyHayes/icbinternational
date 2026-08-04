'use client';

/**
 * State and id derivation for Tabs.
 *
 * The ids are derived rather than stored so a Tab and its TabPanel can be rendered in different
 * parts of the tree and still find each other — a tab strip in a sticky header over a panel three
 * hundred lines down the page is a normal layout, and a registry would make it a special case.
 */

import { createContext, useContext } from 'react';

export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabsContextValue {
  readonly baseId: string;
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly orientation: TabsOrientation;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export const TabsProvider = TabsContext.Provider;

/** @throws when a Tab, TabList or TabPanel is rendered outside a Tabs. */
export function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab, TabList and TabPanel must be rendered inside <Tabs>.');
  return context;
}

/** `aria-labelledby` target on the panel. */
export function tabDomId(baseId: string, value: string): string {
  return `${baseId}-tab-${value}`;
}

/** `aria-controls` target on the tab. */
export function panelDomId(baseId: string, value: string): string {
  return `${baseId}-panel-${value}`;
}
