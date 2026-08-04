/**
 * Operations control.
 *
 * The back-office console every bank has and few people outside operations ever see:
 * business-date management, batch processing, rail configuration, exchange-rate
 * administration, treasury funding and restore points.
 *
 * Ordered by consequence, least first. The business date and the batch console are worked
 * daily; funding the clearing account and restoring the book are not, and they sit at the
 * bottom where nobody reaches them by accident.
 */

'use client';

import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { OpsScreen } from '@/components/ops';

import { BatchConsole } from './batch-console';
import { BusinessDatePanel } from './business-date-panel';
import { Checkpoints } from './checkpoints';
import { RailConfiguration } from './rail-configuration';
import { RateAdministration } from './rate-administration';
import { TreasuryFunding } from './treasury-funding';

/** The back-office control console. */
export function OperationsControlScreen() {
  return (
    <OpsScreen
      title="Operations control"
      description="Business-date management, batch processing, rail configuration, exchange rates, treasury funding and restore points."
    >
      <Tabs defaultValue="date">
        <TabList label="Operations control">
          <Tab value="date">Business date</Tab>
          <Tab value="batch">Batch processing</Tab>
          <Tab value="rails">Rails</Tab>
          <Tab value="rates">Exchange rates</Tab>
          <Tab value="treasury">Treasury</Tab>
          <Tab value="checkpoints">Restore points</Tab>
        </TabList>

        <TabPanel value="date">
          <BusinessDatePanel />
        </TabPanel>
        <TabPanel value="batch">
          <BatchConsole />
        </TabPanel>
        <TabPanel value="rails">
          <RailConfiguration />
        </TabPanel>
        <TabPanel value="rates">
          <RateAdministration />
        </TabPanel>
        <TabPanel value="treasury">
          <TreasuryFunding />
        </TabPanel>
        <TabPanel value="checkpoints">
          <Checkpoints />
        </TabPanel>
      </Tabs>
    </OpsScreen>
  );
}
