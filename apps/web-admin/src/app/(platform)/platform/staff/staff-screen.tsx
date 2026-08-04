/**
 * Staff and access.
 *
 * The register first, because that is where the work is; the matrix second, because it is
 * the reference an access review runs against. Both read from the same permission list the
 * platform enforces, so the picture on screen is the picture in force.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminRoleDefinition } from '@reliance/api-client';
import type { AdminUser } from '@reliance/contracts';
import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import {
  KpiTile,
  OpsScreen,
  Panel,
  QueryState,
  RegisterPanel,
  opsKeys,
  type RetryableQuery,
} from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount } from '@/lib/format';

import { PermissionMatrix } from './permission-matrix';
import { staffColumns } from './staff-columns';
import { StaffDrawer } from './staff-drawer';

/** Rows read per page. */
const PAGE_SIZE = 100;

function Figures({ staff }: Readonly<{ staff: readonly AdminUser[] }>) {
  const active = staff.filter((user) => user.active);
  const unprotected = active.filter((user) => !user.mfaEnrolled);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="Active staff accounts"
        value={formatCount(active.length)}
        hint="Able to sign in to this console today."
      />
      <KpiTile
        label="Without an authenticator"
        tone={unprotected.length > 0 ? 'danger' : 'success'}
        value={formatCount(unprotected.length)}
        hint={
          unprotected.length > 0
            ? 'Each one can sign in with a password alone. Enrol or disable them.'
            : 'Every active account has a second factor.'
        }
      />
      <KpiTile
        label="Disabled accounts"
        value={formatCount(staff.length - active.length)}
        hint="Kept on the register so their history stays attributable."
      />
    </div>
  );
}

/** The staff register and the permission matrix. */
/** Every account the console knows, active or not. */
function StaffRegister({
  query,
  onOpen,
}: {
  readonly query: RetryableQuery & { readonly data?: { readonly data: readonly AdminUser[] } };
  readonly onOpen: (user: AdminUser) => void;
}) {
  return (
    <RegisterPanel
      title="Staff register"
      description="Every account, active or not."
      query={query}
      subject="the staff register"
      tableId="ops-staff"
      caption="Staff accounts"
      rowNoun="staff accounts"
      columns={staffColumns(onOpen)}
      rows={query.data?.data ?? []}
      rowKey={(row) => row.id}
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      exportName="staff"
    />
  );
}

/** Roles against permissions. The guards check the permission, never the role name. */
function MatrixPanel({
  query,
}: {
  readonly query: RetryableQuery & {
    readonly data?: { readonly data: readonly AdminRoleDefinition[] };
  };
}) {
  return (
    <Panel
      title="Permission matrix"
      description="Roles against permissions. Guards check the permission, never the role name."
      flush
    >
      <QueryState query={query} subject="the role definitions">
        <PermissionMatrix roles={query.data?.data ?? []} />
      </QueryState>
    </Panel>
  );
}

export function StaffScreen() {
  const client = useApiClient();
  const [opened, setOpened] = useState<AdminUser | null>(null);

  const staff = useQuery({
    queryKey: opsKeys.staff(),
    queryFn: async ({ signal }) => client.admin.users({ limit: PAGE_SIZE }, { signal }),
  });

  const roles = useQuery({
    queryKey: opsKeys.roles(),
    queryFn: async ({ signal }) => client.admin.roles({ limit: PAGE_SIZE }, { signal }),
  });

  return (
    <OpsScreen
      title="Staff and roles"
      description="Who can sign in to this console, what their roles open, and which accounts are missing a second factor."
    >
      <Figures staff={staff.data?.data ?? []} />

      <Tabs defaultValue="register">
        <TabList label="Staff and roles">
          <Tab value="register">Staff register</Tab>
          <Tab value="matrix">Permission matrix</Tab>
        </TabList>

        <TabPanel value="register">
          <StaffRegister query={staff} onOpen={setOpened} />
        </TabPanel>

        <TabPanel value="matrix">
          <MatrixPanel query={roles} />
        </TabPanel>
      </Tabs>

      <StaffDrawer user={opened} onClose={() => setOpened(null)} />
    </OpsScreen>
  );
}
