'use client';

/**
 * The support screens.
 *
 * Fraud sits alongside messages and disputes rather than inside them, because somebody who has
 * just been defrauded should not have to work out which of the three it counts as.
 */

import { laneRoutes, SubNav, type SubNavItem } from '@/components/transfers';

const SECTIONS: readonly SubNavItem[] = [
  { href: laneRoutes.support.index, label: 'Messages', exact: true },
  { href: laneRoutes.support.disputes, label: 'Disputes' },
  { href: laneRoutes.support.fraud, label: 'Report fraud' },
];

/** Links between the support screens. */
export function SupportNav() {
  return <SubNav label="Support sections" items={SECTIONS} />;
}
