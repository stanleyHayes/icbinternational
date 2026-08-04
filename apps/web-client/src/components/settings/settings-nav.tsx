'use client';

/**
 * The settings screens.
 *
 * Split by what the customer is trying to change rather than by which API serves it. "Security" is
 * one destination even though it touches passwords, second factors and passkeys, because that is
 * one thought.
 */

import { laneRoutes, SubNav, type SubNavItem } from '@/components/transfers';

const SECTIONS: readonly SubNavItem[] = [
  { href: laneRoutes.settings.index, label: 'Your details', exact: true },
  { href: laneRoutes.settings.security, label: 'Security' },
  { href: laneRoutes.settings.devices, label: 'Devices' },
  { href: laneRoutes.settings.limits, label: 'Limits' },
  { href: laneRoutes.settings.notifications, label: 'Notifications' },
  { href: laneRoutes.settings.preferences, label: 'Preferences' },
  { href: laneRoutes.settings.privacy, label: 'Privacy' },
];

/** Links between the settings screens. */
export function SettingsNav() {
  return <SubNav label="Settings sections" items={SECTIONS} />;
}
