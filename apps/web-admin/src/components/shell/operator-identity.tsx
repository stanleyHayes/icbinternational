/**
 * Who is signed in, stated rather than hidden behind a menu.
 *
 * Shared workstations are normal in a back office, and the commonest way an audit trail
 * gets attributed to the wrong person is somebody sitting down at a colleague's screen
 * without noticing. The name and the role are always on display for that reason, and
 * signing out is one click rather than one click inside a menu.
 */

'use client';

import { LogOut } from 'lucide-react';

import type { AdminUser } from '@reliance/contracts';
import { Avatar, Badge, Button } from '@reliance/ui';

import { humaniseCode } from '@/lib/format';
import { useAdminSession } from '@/lib/session';

const SIGN_OUT_LABEL = 'Sign out';

function roleSummary(operator: AdminUser): string {
  return operator.roles.map(humaniseCode).join(', ');
}

/** The signed-in operator and the way out. */
export function OperatorIdentity() {
  const { operator, signOut, isSigningOut } = useAdminSession();
  if (!operator) return null;

  const [primaryRole, ...otherRoles] = operator.roles;
  const extraRoleCount = otherRoles.length;

  return (
    <div className="flex items-center gap-2">
      <Avatar name={operator.fullName} size="sm" />
      <span className="hidden min-w-0 flex-col leading-tight sm:flex">
        <span className="font-body text-fg truncate text-sm font-medium">{operator.fullName}</span>
        <span className="font-body text-fg-muted truncate text-xs" title={roleSummary(operator)}>
          {primaryRole ? humaniseCode(primaryRole) : 'No role assigned'}
          {extraRoleCount > 0 && ` +${extraRoleCount}`}
        </span>
      </span>

      {!operator.mfaEnrolled && (
        <Badge tone="warning" title="Enrol an authenticator with the security desk">
          Authenticator not enrolled
        </Badge>
      )}

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        loading={isSigningOut}
        onClick={signOut}
        aria-label={SIGN_OUT_LABEL}
        title={SIGN_OUT_LABEL}
        startIcon={<LogOut className="size-4" />}
      />
    </div>
  );
}
