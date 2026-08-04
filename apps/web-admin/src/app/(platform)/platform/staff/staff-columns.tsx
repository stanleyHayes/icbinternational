/**
 * The staff register's columns.
 *
 * Whether an account is active and whether it has an authenticator enrolled are the two
 * columns that matter, and they are next to each other for a reason: an active staff
 * account with no second factor is the single largest hole a bank can leave in its own
 * perimeter, and it should be visible without opening anything.
 */

'use client';

import type { AdminUser } from '@reliance/contracts';
import { Badge, Button, StatusPill } from '@reliance/ui';

import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

/** Who the account belongs to and what it opens. */
const REGISTER_COLUMNS: readonly DataColumn<AdminUser>[] = [
  {
    id: 'name',
    header: 'Staff member',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium">{row.fullName}</span>
        <span className="text-fg-muted text-xs">{row.email}</span>
      </span>
    ),
    csv: (row) => `${row.fullName} <${row.email}>`,
    sortValue: (row) => row.fullName,
  },
  {
    id: 'roles',
    header: 'Roles',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-wrap gap-1">
        {row.roles.map((role) => (
          <Badge key={role}>{humaniseCode(role)}</Badge>
        ))}
      </span>
    ),
    csv: (row) => row.roles.join(' | '),
  },
  {
    id: 'active',
    header: 'Account',
    alwaysVisible: true,
    cell: (row) => (
      <StatusPill
        tone={row.active ? 'success' : 'neutral'}
        label={row.active ? 'Active' : 'Disabled'}
      />
    ),
    csv: (row) => (row.active ? 'active' : 'disabled'),
    sortValue: (row) => (row.active ? 'active' : 'disabled'),
  },
  {
    id: 'mfa',
    header: 'Authenticator',
    alwaysVisible: true,
    cell: (row) => (
      <StatusPill
        tone={row.mfaEnrolled ? 'success' : 'danger'}
        label={row.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}
      />
    ),
    csv: (row) => (row.mfaEnrolled ? 'enrolled' : 'not enrolled'),
    sortValue: (row) => (row.mfaEnrolled ? 'enrolled' : 'not enrolled'),
  },
  {
    id: 'permissions',
    header: 'Permissions',
    align: 'end',
    cell: (row) => row.permissions.length,
    csv: (row) => String(row.permissions.length),
    sortValue: (row) => row.permissions.length,
  },
  {
    id: 'ipAllowlist',
    header: 'Network allowlist',
    cell: (row) => (row.ipAllowlist.length === 0 ? 'Any network' : row.ipAllowlist.join(', ')),
    csv: (row) => row.ipAllowlist.join(' '),
  },
  {
    id: 'lastLoginAt',
    header: 'Last signed in (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.lastLoginAt)}</span>,
    csv: (row) => row.lastLoginAt ?? '',
    sortValue: (row) => row.lastLoginAt ?? '',
  },
];

/** The register's columns, bound to the staff drawer. */
export function staffColumns(onOpen: (user: AdminUser) => void): readonly DataColumn<AdminUser>[] {
  return [
    ...REGISTER_COLUMNS,
    {
      id: 'open',
      header: 'Access',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
          Open
        </Button>
      ),
      csv: (row) => row.id,
    },
  ];
}
