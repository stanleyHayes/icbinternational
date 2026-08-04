/**
 * Permission-aware rendering.
 *
 * **Server-side authorisation is the real control.** Every route the platform exposes
 * checks the operator's permissions itself and answers `403` when they are missing, and
 * that check is what protects customer data. Nothing in this file is a security
 * boundary — hiding a button in the DOM stops nobody who can open a network tab.
 *
 * What this exists for is the other half of the problem: an operator should never be
 * offered an action that will be refused. A KYC analyst who can see a "Reverse posting"
 * button learns to distrust the console, and a support agent who clicks one gets a
 * denial they cannot interpret. So the console renders only what the signed-in
 * permission list allows, and the platform enforces the same list independently.
 */

'use client';

import { useMemo, type ReactNode } from 'react';

import type { Permission } from '@reliance/contracts';

import { useAdminSession } from '@/lib/session';

/** How a multi-permission check is combined. */
export type PermissionMode = 'all' | 'any';

/** The signed-in operator's permissions, with the checks the console needs. */
export interface PermissionSet {
  /** Everything the platform resolved for this operator, in contract order. */
  readonly granted: readonly Permission[];
  /** True when the operator holds this exact permission. */
  readonly has: (permission: Permission) => boolean;
  /** True when the operator holds at least one of these. An empty list is `false`. */
  readonly hasAny: (permissions: readonly Permission[]) => boolean;
  /** True when the operator holds every one of these. An empty list is `true`. */
  readonly hasAll: (permissions: readonly Permission[]) => boolean;
}

/** An empty permission set, used before the session resolves and after it ends. */
const NO_PERMISSIONS: readonly Permission[] = Object.freeze([]);

function buildSet(granted: readonly Permission[]): PermissionSet {
  const index = new Set(granted);
  return {
    granted,
    has: (permission) => index.has(permission),
    hasAny: (permissions) => permissions.some((permission) => index.has(permission)),
    hasAll: (permissions) => permissions.every((permission) => index.has(permission)),
  };
}

/**
 * The current operator's permissions.
 *
 * Answers "no" to everything while the session is still resolving, which is the correct
 * default: a control that appears a beat late is a smaller problem than one that flashes
 * on screen for an operator who may not be allowed to use it.
 */
export function usePermissions(): PermissionSet {
  const { operator } = useAdminSession();
  const granted = operator?.permissions ?? NO_PERMISSIONS;
  return useMemo(() => buildSet(granted), [granted]);
}

/** True when the operator holds the permission. Shorthand for the common single check. */
export function useIsAllowed(permission: Permission): boolean {
  return usePermissions().has(permission);
}

export interface CanProps {
  /** The single permission required. Use `anyOf` or `allOf` for a combination. */
  readonly permission?: Permission;
  /** Renders when the operator holds at least one of these. */
  readonly anyOf?: readonly Permission[];
  /** Renders when the operator holds all of these. */
  readonly allOf?: readonly Permission[];
  /**
   * Rendered instead when the permission is absent. Defaults to nothing at all — an
   * operator should not be told what they are missing on every screen that has a
   * restricted control, only where the absence is itself the point.
   */
  readonly fallback?: ReactNode;
  readonly children: ReactNode;
}

function isAllowed(permissions: PermissionSet, props: CanProps): boolean {
  if (props.permission && !permissions.has(props.permission)) return false;
  if (props.anyOf && !permissions.hasAny(props.anyOf)) return false;
  if (props.allOf && !permissions.hasAll(props.allOf)) return false;
  // A guard with no conditions is a wiring mistake, and rendering the children would
  // hide it. Refusing is the failure that gets noticed and fixed.
  return Boolean(props.permission ?? props.anyOf ?? props.allOf);
}

/**
 * Renders its children only when the operator's permissions allow the action.
 *
 * ```tsx
 * <Can permission="posting:approve">
 *   <DecisionPanel … />
 * </Can>
 * ```
 *
 * Remember what this is and is not: the platform refuses the call regardless. This keeps
 * the console from offering an action it knows will be refused.
 */
export function Can(props: CanProps) {
  const permissions = usePermissions();
  return isAllowed(permissions, props) ? props.children : (props.fallback ?? null);
}
