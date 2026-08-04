'use client';

/**
 * Standing orders: the list, and the month they fall in.
 *
 * Two views of the same data because customers ask two different questions of it. "What have I got
 * set up?" is a list. "What is going out before the 28th?" is a calendar. Neither answers the
 * other well, and both are cheap once the orders are fetched.
 */

import { useQuery } from '@tanstack/react-query';

import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { laneRoutes, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { OrderRow } from './order-row';
import { ScheduleCalendar } from './schedule-calendar';

const NEW_ORDER = <LinkButton href={laneRoutes.scheduled.add}>Set up a standing order</LinkButton>;

const NO_ORDERS = (
  <EmptyPanel
    title="No standing orders yet"
    description="Standing orders are payments that repeat on a schedule — rent, a subscription, money to a family member. Set one up and it runs until you stop it."
    action={NEW_ORDER}
  />
);

/**
 * @example <ScheduledScreen />
 */
export function ScheduledScreen() {
  const filters = {};
  const orders = useQuery({
    queryKey: movementKeys.transferOrders.list(filters),
    queryFn: async () => (await browserApi().transferOrders.list()).data,
  });

  return (
    <Section
      title="Standing orders"
      description="Payments that repeat on a schedule you set."
      action={NEW_ORDER}
    >
      <QueryPanel
        query={orders}
        skeletonRows={3}
        isEmpty={(list) => list.length === 0}
        empty={NO_ORDERS}
      >
        {(list) => (
          <Tabs defaultValue="list">
            <TabList label="How to view your standing orders">
              <Tab value="list">List</Tab>
              <Tab value="calendar">This month</Tab>
            </TabList>
            <TabPanel value="list">
              <ul className="-mx-3 flex flex-col">
                {list.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </ul>
            </TabPanel>
            <TabPanel value="calendar">
              <ScheduleCalendar orders={list} />
            </TabPanel>
          </Tabs>
        )}
      </QueryPanel>
    </Section>
  );
}
