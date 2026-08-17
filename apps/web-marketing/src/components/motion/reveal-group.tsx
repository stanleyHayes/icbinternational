'use client';

import { Children, isValidElement } from 'react';
import type { ElementType, ReactNode } from 'react';

import { Reveal } from './reveal';

/** The stagger between siblings, inside the 30–80ms band for grouped entrances. */
const STAGGER_MS = 60;

/** A stable key for a child: the key its element already carries, else its text. */
function childKey(child: ReactNode): string {
  if (isValidElement(child) && child.key !== null) return child.key;
  return String(child);
}

export interface RevealGroupProps {
  readonly children: ReactNode;
  /** The tag each item renders as — `li` for grids whose items are list elements. */
  readonly as?: ElementType;
  /** Class applied to every item's reveal element. */
  readonly itemClassName?: string;
}

/**
 * A row of reveals that enter one after another.
 *
 * Each child is wrapped in its own `Reveal` with a 60ms stagger, so a grid reads as a
 * cascade rather than a single block. The stagger is decoration only — every item is
 * interactive from first paint, hidden or not.
 */
export function RevealGroup({ children, as = 'div', itemClassName }: RevealGroupProps) {
  return Children.map(children, (child, index) => (
    <Reveal key={childKey(child)} as={as} className={itemClassName} delay={index * STAGGER_MS}>
      {child}
    </Reveal>
  ));
}
