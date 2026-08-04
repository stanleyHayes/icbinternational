/**
 * The permission matrix.
 *
 * Roles down the side, permissions across the top, and a mark where the two meet. Written
 * as a table rather than as a list per role because the question this screen answers is
 * almost always the other way round: who can approve a posting, who can see a customer's
 * address. A list of roles cannot be read that way; a matrix can.
 *
 * Guards check permissions, never role names, so the matrix is the authoritative picture
 * of what a role actually opens.
 */

'use client';

import { Check } from 'lucide-react';

import type { AdminRoleDefinition } from '@reliance/api-client';
import { Permission } from '@reliance/contracts';

import { formatCount, humaniseCode } from '@/lib/format';

/** Every permission the contract defines, in a stable order. */
const PERMISSIONS = Object.values(Permission);

const HEAD = 'px-2 py-2 text-left font-medium text-fg-muted';
const CELL = 'px-2 py-2 text-center';

function permissionLabel(permission: string): string {
  const [resource, ...rest] = permission.split(':');
  return `${humaniseCode(resource ?? permission)} · ${rest.join(' ')}`;
}

function RoleRow({ role }: Readonly<{ role: AdminRoleDefinition }>) {
  const held = new Set(role.permissions);

  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className="rb-sticky-column px-2 py-2 text-left font-medium">
        <span className="flex flex-col">
          <span>{role.label}</span>
          <span className="font-body text-fg-muted text-xs font-normal">
            {formatCount(role.memberCount)} staff
          </span>
        </span>
      </th>
      {PERMISSIONS.map((permission) => (
        <td key={permission} className={CELL}>
          {held.has(permission) ? (
            <>
              <Check aria-hidden="true" className="text-success mx-auto size-4" />
              <span className="sr-only">Granted</span>
            </>
          ) : (
            <span className="sr-only">Not granted</span>
          )}
        </td>
      ))}
    </tr>
  );
}

export interface PermissionMatrixProps {
  readonly roles: readonly AdminRoleDefinition[];
}

/** Which role opens which permission. */
export function PermissionMatrix({ roles }: PermissionMatrixProps) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">
          Roles against permissions. A tick means the role grants that permission.
        </caption>
        <thead>
          <tr className="border-border bg-surface-sunken border-b">
            <th scope="col" className={`${HEAD} rb-sticky-column`}>
              Role
            </th>
            {PERMISSIONS.map((permission) => (
              <th key={permission} scope="col" className={`${HEAD} whitespace-nowrap`}>
                <span className="block max-w-24 text-xs">{permissionLabel(permission)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <RoleRow key={role.role} role={role} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
