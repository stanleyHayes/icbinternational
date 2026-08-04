'use client';

/**
 * The payment screens.
 *
 * Bills, top-ups, requests and direct debits are separate products that happen to share a section.
 * Each gets a screen, and the nav keeps them one click apart.
 */

import { laneRoutes, SubNav, type SubNavItem } from '@/components/transfers';

const SECTIONS: readonly SubNavItem[] = [
  { href: laneRoutes.payments.index, label: 'Overview', exact: true },
  { href: laneRoutes.payments.billers, label: 'Pay a bill' },
  { href: laneRoutes.payments.topUp, label: 'Top up a phone' },
  { href: laneRoutes.payments.requests, label: 'Request money' },
  { href: laneRoutes.payments.split, label: 'Split a bill' },
  { href: laneRoutes.payments.qr, label: 'QR' },
  { href: laneRoutes.payments.mandates, label: 'Direct debits' },
  { href: laneRoutes.payments.receipts, label: 'Receipts' },
];

/** Links between the payment screens. */
export function PaymentsNav() {
  return <SubNav label="Payment sections" items={SECTIONS} />;
}
