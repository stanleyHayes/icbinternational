/**
 * One customer, everything about them.
 *
 * Two things happen here that no tab is allowed to do for itself. The record declares
 * the customer as the console's subject, which is what raises the banner naming whose
 * data is on screen — and it does so from the loaded record, so the banner can never name
 * one customer while the tabs show another. And the account list is fetched once and its
 * ids handed down, because five tabs each resolving "which accounts are theirs" is five
 * chances to get the answer differently.
 */

'use client';

import { useState } from 'react';

import { Permission, type User } from '@reliance/contracts';
import { ErrorState, Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { QueueError, QueueLoading } from '@/components/compliance/kit';
import { useCustomerSubject, type ImpersonationGrantSummary } from '@/lib/customer-context';
import { usePermissions } from '@/lib/permissions';

import { fullName } from '../customer-columns';
import { useCustomer } from '../data/use-customers';
import { useCustomerAccounts, useCustomerPostings } from '../data/use-dossier';

import { AccountsTab } from './accounts-tab';
import { ActivityTab } from './activity-tab';
import { CardsTab } from './cards-tab';
import { CustomerHeader } from './customer-header';
import { FreezeDialog } from './freeze-dialog';
import { ImpersonationDialog } from './impersonation-dialog';
import { OverviewTab } from './overview-tab';
import { RiskTab } from './risk-tab';
import { SecurityTab } from './security-tab';
import { SupportTab } from './support-tab';
import { TimelineTab } from './timeline-tab';

const TAB_LABELS = [
  ['overview', 'Overview'],
  ['accounts', 'Accounts'],
  ['activity', 'Activity'],
  ['cards', 'Cards'],
  ['risk', 'Risk'],
  ['support', 'Support'],
  ['security', 'Security'],
  ['history', 'History'],
] as const;

interface DialogState {
  readonly freeze: boolean;
  readonly impersonate: boolean;
}

const CLOSED: DialogState = { freeze: false, impersonate: false };

interface RecordTabsProps {
  readonly customer: User;
  readonly accountIds: readonly string[];
  readonly transactionIds: readonly string[];
}

function RecordTabs({ customer, accountIds, transactionIds }: RecordTabsProps) {
  const id = customer.id;

  return (
    <Tabs defaultValue="overview">
      <TabList label="Customer record sections">
        {TAB_LABELS.map(([value, label]) => (
          <Tab key={value} value={value}>
            {label}
          </Tab>
        ))}
      </TabList>

      <TabPanel value="overview">
        <OverviewTab customerId={id} />
      </TabPanel>
      <TabPanel value="accounts">
        <AccountsTab customerId={id} accountIds={accountIds} />
      </TabPanel>
      <TabPanel value="activity">
        <ActivityTab customerId={id} accountIds={accountIds} />
      </TabPanel>
      <TabPanel value="cards">
        <CardsTab customerId={id} accountIds={accountIds} />
      </TabPanel>
      <TabPanel value="risk">
        <RiskTab customerId={id} />
      </TabPanel>
      <RelationshipPanels customer={customer} transactionIds={transactionIds} />
    </Tabs>
  );
}

function RelationshipPanels(props: Readonly<Omit<RecordTabsProps, 'accountIds'>>) {
  const { customer, transactionIds } = props;

  return (
    <>
      <TabPanel value="support">
        <SupportTab
          customerId={customer.id}
          customerName={fullName(customer)}
          transactionIds={transactionIds}
        />
      </TabPanel>
      <TabPanel value="security">
        <SecurityTab customer={customer} />
      </TabPanel>
      <TabPanel value="history">
        <TimelineTab customerId={customer.id} />
      </TabPanel>
    </>
  );
}

function LoadFailed({ customer }: Readonly<{ customer: ReturnType<typeof useCustomer> }>) {
  return (
    <div className="p-6">
      <QueueError
        error={customer.error}
        subject="this customer record"
        onRetry={customer.refetch}
      />
    </div>
  );
}

function NoAccess() {
  return (
    <div className="p-6">
      <ErrorState
        title="You cannot open customer records"
        description="Your role does not include reading customer data. Ask your team lead to raise an access request with the security desk."
        action={null}
      />
    </div>
  );
}

/** The whole record, once the customer has loaded. */
export function CustomerRecord({ customerId }: Readonly<{ customerId: string }>) {
  const permissions = usePermissions();
  const customer = useCustomer(customerId);
  const accounts = useCustomerAccounts(customerId);
  const accountIds = (accounts.data ?? []).map((account) => account.id);
  const postings = useCustomerPostings(customerId, accountIds);

  const [dialogs, setDialogs] = useState<DialogState>(CLOSED);
  const [grant, setGrant] = useState<ImpersonationGrantSummary | null>(null);

  const name = customer.data ? fullName(customer.data) : null;
  useCustomerSubject(
    name === null ? null : { id: customerId, name, impersonation: grant ?? undefined },
  );

  if (!permissions.has(Permission.CUSTOMER_READ)) return <NoAccess />;

  if (customer.isPending) return <QueueLoading label="the customer record" />;
  if (customer.isError) return <LoadFailed customer={customer} />;

  const record = customer.data;

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <CustomerHeader
        customer={record}
        onFreeze={() => setDialogs({ ...CLOSED, freeze: true })}
        onImpersonate={() => setDialogs({ ...CLOSED, impersonate: true })}
      />

      <RecordTabs
        customer={record}
        accountIds={accountIds}
        transactionIds={(postings.data ?? []).map((posting) => posting.id)}
      />

      <FreezeDialog customer={record} open={dialogs.freeze} onClose={() => setDialogs(CLOSED)} />
      <ImpersonationDialog
        customer={record}
        open={dialogs.impersonate}
        onClose={() => setDialogs(CLOSED)}
        onGranted={setGrant}
      />
    </div>
  );
}
