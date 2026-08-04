/**
 * Communications.
 *
 * Templates are what the bank says without anyone present; campaigns are what it says
 * deliberately. Both on one screen because the second is built out of the first.
 */

'use client';

import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { OpsScreen } from '@/components/ops';

import { CampaignStudio } from './campaign-studio';
import { TemplateStudio } from './template-studio';

/** Message templates and campaign sends. */
export function CommsScreen() {
  return (
    <OpsScreen
      title="Communications"
      description="The messages the bank sends automatically, and the campaigns it schedules."
    >
      <Tabs defaultValue="templates">
        <TabList label="Communications">
          <Tab value="templates">Templates</Tab>
          <Tab value="campaigns">Campaigns</Tab>
        </TabList>

        <TabPanel value="templates">
          <TemplateStudio />
        </TabPanel>
        <TabPanel value="campaigns">
          <CampaignStudio />
        </TabPanel>
      </Tabs>
    </OpsScreen>
  );
}
