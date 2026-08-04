'use client';

/**
 * The two halves of saving.
 *
 * Goals and fixed deposits are different products with different questions attached — "how close
 * am I?" against "what is the rate?" — so they get a screen each rather than a single page nobody
 * can scan.
 */

import { laneRoutes, SubNav, type SubNavItem } from '@/components/transfers';

const SECTIONS: readonly SubNavItem[] = [
  { href: laneRoutes.save.index, label: 'Goals', exact: true },
  { href: laneRoutes.save.deposits, label: 'Fixed deposits' },
];

/** Links between the two Save screens. */
export function SaveNav() {
  return <SubNav label="Saving sections" items={SECTIONS} />;
}
