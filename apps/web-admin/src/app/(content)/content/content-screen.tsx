/**
 * The content studio.
 *
 * Everything a customer reads that is not a number: the website's pages, the journal, the
 * help centre and the branch list. Grouped by what an editor is doing rather than by which
 * endpoint serves it.
 */

'use client';

import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { OpsScreen } from '@/components/ops';

import { ArticleTable, FaqTable, LocationTable } from './collection-tables';
import { PageList } from './page-list';

/** Pages, articles, the help centre and branches. */
export function ContentScreen() {
  return (
    <OpsScreen
      title="Content studio"
      description="Pages, articles, help-centre answers and branch details, from draft through review to publication."
    >
      <Tabs defaultValue="pages">
        <TabList label="Content studio">
          <Tab value="pages">Pages</Tab>
          <Tab value="articles">Articles</Tab>
          <Tab value="questions">Help centre</Tab>
          <Tab value="branches">Branches</Tab>
        </TabList>

        <TabPanel value="pages">
          <PageList />
        </TabPanel>
        <TabPanel value="articles">
          <ArticleTable />
        </TabPanel>
        <TabPanel value="questions">
          <FaqTable />
        </TabPanel>
        <TabPanel value="branches">
          <LocationTable />
        </TabPanel>
      </Tabs>
    </OpsScreen>
  );
}
