'use client';

/**
 * The borrowing screens.
 *
 * Kept apart because they answer different questions: what am I paying, what could I get, and what
 * would it cost. A single page carrying all three is a page nobody can scan.
 */

import { laneRoutes, SubNav, type SubNavItem } from '@/components/transfers';

const SECTIONS: readonly SubNavItem[] = [
  { href: laneRoutes.borrow.index, label: 'Your borrowing', exact: true },
  { href: laneRoutes.borrow.calculator, label: 'Calculator' },
  { href: laneRoutes.borrow.apply, label: 'Apply' },
  { href: laneRoutes.borrow.overdraft, label: 'Overdraft' },
];

/** Links between the borrowing screens. */
export function BorrowNav() {
  return <SubNav label="Borrowing sections" items={SECTIONS} />;
}
