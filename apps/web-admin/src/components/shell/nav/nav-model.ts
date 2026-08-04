/**
 * The shape of the console's navigation, and the rule that decides what appears in it.
 *
 * Navigation is derived from permissions, not from role names. A role is a bundle that
 * changes; the permission is the thing the platform actually checks. Deriving the menu
 * from `roles.includes('COMPLIANCE_OFFICER')` would drift from what the API allows the
 * first time somebody adjusts a bundle, and the operator would find out by being refused.
 */

import type { LucideIcon } from 'lucide-react';

import type { Permission } from '@reliance/contracts';

import type { PermissionSet } from '@/lib/permissions';

/** One destination in the sidebar and in the command palette. */
export interface NavItem {
  /** Stable identity, used as a React key and as a saved-view namespace. */
  readonly id: string;
  /** What the operator reads. */
  readonly label: string;
  /** One line saying what the screen is for, shown in the command palette. */
  readonly description: string;
  /** Absolute path inside the console, e.g. `/aml/alerts`. */
  readonly path: string;
  readonly icon: LucideIcon;
  /**
   * Shown only when the operator holds at least one of these. An item with no
   * permissions is visible to every signed-in operator.
   */
  readonly requires?: readonly Permission[];
  /** Extra words the command palette will match on, for the console's own vocabulary. */
  readonly keywords?: readonly string[];
}

/** A labelled group of destinations. */
export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** True when the operator's permissions allow this destination to be offered. */
export function isItemVisible(item: NavItem, permissions: PermissionSet): boolean {
  if (!item.requires || item.requires.length === 0) return true;
  return permissions.hasAny(item.requires);
}

/**
 * The navigation an operator should see.
 *
 * A section whose every item is hidden disappears with them — an empty "Compliance"
 * heading tells an operator only that there is something they are not allowed to know
 * about, which is worse than saying nothing.
 */
export function visibleSections(
  sections: readonly NavSection[],
  permissions: PermissionSet,
): NavSection[] {
  const result: NavSection[] = [];

  for (const section of sections) {
    const items = section.items.filter((item) => isItemVisible(item, permissions));
    if (items.length > 0) result.push({ ...section, items });
  }

  return result;
}

/** Every visible destination, flattened — what the command palette searches over. */
export function visibleItems(
  sections: readonly NavSection[],
  permissions: PermissionSet,
): NavItem[] {
  return visibleSections(sections, permissions).flatMap((section) => [...section.items]);
}

/** The destination an operator should land on when they open the console. */
export function landingItem(
  sections: readonly NavSection[],
  permissions: PermissionSet,
): NavItem | null {
  return visibleItems(sections, permissions)[0] ?? null;
}
