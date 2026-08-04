/**
 * Accessibility smoke tests for the composites, plus the interaction contracts that axe cannot
 * see: a dialog that traps focus, a tab strip driven by the arrow keys, a pager that marks the
 * current page.
 */

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { useState, type ReactElement } from 'react';

import { Button } from '../primitives/button.js';
import { setupUser } from '../test/user';

import { Alert } from './alert.js';
import { Avatar } from './avatar.js';
import { Badge } from './badge.js';
import { Card, CardBody, CardHeader } from './card.js';
import { Dialog } from './dialog.js';
import { Drawer } from './drawer.js';
import { EmptyState } from './empty-state.js';
import { ErrorState } from './error-state.js';
import { Pagination } from './pagination.js';
import { Skeleton, SkeletonText } from './skeleton.js';
import { StatusPill } from './status-pill.js';
import { Stepper } from './stepper.js';
import { Table } from './table.js';
import { Tab, TabList, TabPanel, Tabs } from './tabs.js';
import { ToastProvider, useToast } from './toast-provider.js';
import { Tooltip } from './tooltip.js';

expect.extend(toHaveNoViolations);

const STEPS = [
  { id: 'identity', label: 'Identity' },
  { id: 'address', label: 'Address', description: 'Proof from the last three months' },
  { id: 'review', label: 'Review' },
];

const ROWS = [
  { id: 'a', payee: 'Tesco', amount: 4250n },
  { id: 'b', payee: 'Octopus Energy', amount: 9100n },
];

const CASES: readonly (readonly [string, ReactElement])[] = [
  [
    'Card',
    <Card key="card">
      <CardHeader title="Everyday account" description="•••• 5678" />
      <CardBody>Balance detail</CardBody>
    </Card>,
  ],
  [
    'Badge',
    <Badge key="badge" tone="pending">
      Awaiting review
    </Badge>,
  ],
  ['StatusPill', <StatusPill key="pill" tone="pending" label="Pending" live />],
  ['Avatar', <Avatar key="avatar" name="James Mensah" standalone />],
  ['Skeleton', <SkeletonText key="skeleton" lines={2} />],
  [
    'EmptyState',
    <EmptyState key="empty" title="No payees yet" action={<Button>Add a payee</Button>} />,
  ],
  [
    'ErrorState',
    <ErrorState key="error" reference="req_123" action={<Button>Try again</Button>} />,
  ],
  [
    'Alert',
    <Alert key="alert" tone="warning" title="Card frozen">
      Unfreeze it to spend.
    </Alert>,
  ],
  [
    'Tabs',
    <Tabs key="tabs" defaultValue="activity">
      <TabList label="Account sections">
        <Tab value="activity">Activity</Tab>
        <Tab value="details">Details</Tab>
      </TabList>
      <TabPanel value="activity">Recent activity</TabPanel>
      <TabPanel value="details">Sort code</TabPanel>
    </Tabs>,
  ],
  [
    'Tooltip',
    <Tooltip key="tooltip" content="Excludes pending authorisations">
      <button type="button">Available balance</button>
    </Tooltip>,
  ],
  [
    'Table',
    <Table
      key="table"
      caption="Recent transactions"
      rows={ROWS}
      rowKey={(row) => row.id}
      columns={[
        { id: 'payee', header: 'Payee', cell: (row) => row.payee, sortValue: (row) => row.payee },
        { id: 'amount', header: 'Amount', align: 'end', cell: (row) => String(row.amount) },
      ]}
    />,
  ],
  ['Pagination', <Pagination key="pager" page={3} totalPages={9} onPageChange={() => undefined} />],
  [
    'Stepper',
    <Stepper key="stepper" label="Identity verification" steps={STEPS} currentIndex={1} />,
  ],
];

describe('composites are axe-clean', () => {
  it.each(CASES)('%s', async (_name, element) => {
    const { container } = render(element);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('Dialog', async () => {
    const { baseElement } = render(
      <Dialog open onClose={() => undefined} title="Confirm transfer" description="£24.00 to Tesco">
        Body
      </Dialog>,
    );

    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('Skeleton is hidden from assistive tech', () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Dialog', () => {
  it('is named by its title and closes on Escape', async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} title="Confirm transfer">
        Body
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Confirm transfer' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps focus inside the panel', async () => {
    const user = setupUser();
    render(
      <>
        <button type="button">Behind the modal</button>
        <Dialog
          open
          onClose={() => undefined}
          title="Confirm transfer"
          footer={<Button>Send</Button>}
        >
          Body
        </Dialog>
      </>,
    );

    await user.tab();
    await user.tab();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Behind the modal' })).not.toHaveFocus();
  });
});

describe('Drawer', () => {
  it('renders as a named dialog', () => {
    render(
      <Drawer open onClose={() => undefined} title="Transaction detail">
        Body
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Transaction detail' })).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('moves selection with the arrow keys and keeps one tab in the tab order', async () => {
    const user = setupUser();
    render(
      <Tabs defaultValue="activity">
        <TabList label="Account sections">
          <Tab value="activity">Activity</Tab>
          <Tab value="details">Details</Tab>
        </TabList>
        <TabPanel value="activity">Recent activity</TabPanel>
        <TabPanel value="details">Sort code</TabPanel>
      </Tabs>,
    );

    const [activity, details] = screen.getAllByRole('tab');
    expect(activity).toHaveAttribute('tabindex', '0');
    expect(details).toHaveAttribute('tabindex', '-1');

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sort code');
  });
});

describe('Table', () => {
  it('sorts on a header click and reports it through aria-sort', async () => {
    const user = setupUser();
    render(
      <Table
        caption="Recent transactions"
        rows={ROWS}
        rowKey={(row) => row.id}
        columns={[
          { id: 'payee', header: 'Payee', cell: (row) => row.payee, sortValue: (row) => row.payee },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Payee/ }));

    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getAllByRole('cell')[0]).toHaveTextContent('Octopus Energy');
  });
});

describe('Pagination', () => {
  it('marks the current page and disables the ends', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });
});

describe('Toast', () => {
  function Notifier() {
    const { notify } = useToast();
    return (
      <Button onClick={() => notify({ tone: 'success', title: 'Payee added' })}>Add payee</Button>
    );
  }

  it('announces through a live region that was mounted before the message', async () => {
    const user = setupUser();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );

    expect(screen.getByRole('log', { name: 'Notifications' })).toBeEmptyDOMElement();

    await user.click(screen.getByRole('button', { name: 'Add payee' }));

    expect(screen.getByText('Payee added')).toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('describes its trigger on focus without replacing the trigger name', async () => {
    const user = setupUser();
    render(
      <Tooltip content="Excludes pending authorisations">
        <button type="button">Available balance</button>
      </Tooltip>,
    );

    await user.tab();

    const trigger = screen.getByRole('button', { name: 'Available balance' });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Excludes pending authorisations');
  });
});

describe('controlled state', () => {
  it('lets a parent own the tab selection', async () => {
    const user = setupUser();

    function Controlled() {
      const [value, setValue] = useState('activity');
      return (
        <Tabs value={value} defaultValue="activity" onValueChange={setValue}>
          <TabList label="Sections">
            <Tab value="activity">Activity</Tab>
            <Tab value="details">Details</Tab>
          </TabList>
          <TabPanel value={value}>{value}</TabPanel>
        </Tabs>
      );
    }
    render(<Controlled />);

    await user.click(screen.getByRole('tab', { name: 'Details' }));

    expect(screen.getByRole('tabpanel')).toHaveTextContent('details');
  });
});
