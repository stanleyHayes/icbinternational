/**
 * `/platform/staff` — staff accounts, roles and the permission matrix.
 */

import type { Metadata } from 'next';

import { StaffScreen } from './staff-screen';

export const metadata: Metadata = {
  title: 'Staff and roles',
  description: 'Staff accounts, role bundles and the permission matrix.',
};

/** Staff and access administration. */
export default function StaffPage() {
  return <StaffScreen />;
}
