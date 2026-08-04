/**
 * One staff account.
 *
 * The two controls here are the ones that change what a colleague can do to customers, so
 * both state their consequence: disabling an account ends every session it holds, and
 * changing a role changes what the platform will allow the next time they click anything.
 * The permission list is shown in full rather than summarised, because "Operations" means
 * nothing without it.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AdminRole, type AdminUser } from '@reliance/contracts';
import { Alert, Badge, Button, Switch } from '@reliance/ui';

import { opsKeys } from '@/components/ops';
import { DetailDrawer, DetailField, DetailSection } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatInstant, humaniseCode } from '@/lib/format';

/** Every role the platform defines, so one can be added as well as removed. */
const ALL_ROLES = Object.values(AdminRole);

interface RoleTogglesProps {
  readonly user: AdminUser;
  readonly onToggle: (role: AdminRole) => void;
  readonly disabled: boolean;
}

function RoleToggles({ user, onToggle, disabled }: RoleTogglesProps) {
  const held = new Set(user.roles);

  return (
    <div className="flex flex-col gap-2">
      {ALL_ROLES.map((role) => (
        <Switch
          key={role}
          checked={held.has(role)}
          disabled={disabled || (held.has(role) && user.roles.length === 1)}
          onChange={() => onToggle(role)}
        >
          {humaniseCode(role)}
        </Switch>
      ))}
      <p className="font-body text-fg-muted text-xs">
        A staff account must keep at least one role. Remove the account instead of stripping the
        last one.
      </p>
    </div>
  );
}

/** The facts about the account itself, as opposed to what it can reach. */
function AccountSection({ user }: { readonly user: AdminUser }) {
  return (
    <DetailSection title="Account">
      <DetailField label="Status">{user.active ? 'Active' : 'Disabled'}</DetailField>
      <DetailField label="Authenticator">
        {user.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}
      </DetailField>
      <DetailField label="Networks">
        {user.ipAllowlist.length === 0 ? 'Any network' : user.ipAllowlist.join(', ')}
      </DetailField>
      <DetailField label="Last signed in">{formatInstant(user.lastLoginAt)}</DetailField>
      <DetailField label="Created">{formatInstant(user.createdAt)}</DetailField>
    </DetailSection>
  );
}

/** The permissions the held roles resolve to, listed rather than summarised. */
function PermissionsSection({ user }: { readonly user: AdminUser }) {
  return (
    <DetailSection title="What these roles open">
      <div className="col-span-2 flex flex-wrap gap-1.5">
        {user.permissions.map((permission) => (
          <Badge key={permission} tone="accent">
            {permission}
          </Badge>
        ))}
      </div>
    </DetailSection>
  );
}

export interface StaffDrawerProps {
  readonly user: AdminUser | null;
  readonly onClose: () => void;
}

/**
 * The one write this drawer makes, and the two edits expressed in terms of it.
 *
 * Kept out of the component so the component reads as layout. `toggleRole` refuses to
 * remove the last role here rather than in the markup, because it is a rule about staff
 * accounts and not about a switch.
 */
function useStaffAccount(user: AdminUser | null) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: async (patch: Partial<AdminUser>) => {
      if (!user) throw new Error('No staff account is open.');
      return client.admin.updateUser(user.id, patch);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opsKeys.all('platform') }),
  });

  const toggleRole = (role: AdminRole): void => {
    if (!user) return;
    const next = user.roles.includes(role)
      ? user.roles.filter((candidate) => candidate !== role)
      : [...user.roles, role];
    if (next.length === 0) return;
    update.mutate({ roles: next });
  };

  const setActive = (): void => {
    if (user) update.mutate({ active: !user.active });
  };

  return { update, toggleRole, setActive };
}

/** The single destructive control, which states its consequence rather than its verb. */
function ActiveToggle({
  user,
  pending,
  onToggle,
}: {
  readonly user: AdminUser;
  readonly pending: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <Button variant={user.active ? 'danger' : 'primary'} loading={pending} onClick={onToggle}>
      {user.active ? 'Disable this account' : 'Re-enable this account'}
    </Button>
  );
}

/** A staff account, its roles, and what those roles open. */
export function StaffDrawer({ user, onClose }: StaffDrawerProps) {
  const { update, toggleRole, setActive } = useStaffAccount(user);

  return (
    <DetailDrawer
      open={user !== null}
      onClose={onClose}
      title={user?.fullName ?? 'Staff account'}
      subtitle={user?.email}
      recordId={user?.id}
      footer={user && <ActiveToggle user={user} pending={update.isPending} onToggle={setActive} />}
    >
      {update.error && <Alert tone="danger">{messageFor(update.error)}</Alert>}

      {user && !user.mfaEnrolled && (
        <Alert tone="danger" title="No authenticator enrolled">
          This account can sign in with a password alone. Have the security desk enrol an
          authenticator before it is used again.
        </Alert>
      )}

      {user && (
        <>
          <AccountSection user={user} />
          <DetailSection title="Roles">
            <div className="col-span-2">
              <RoleToggles user={user} onToggle={toggleRole} disabled={update.isPending} />
            </div>
          </DetailSection>
          <PermissionsSection user={user} />
        </>
      )}
    </DetailDrawer>
  );
}
