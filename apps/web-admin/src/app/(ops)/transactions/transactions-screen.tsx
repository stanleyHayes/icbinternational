/**
 * Transaction operations.
 *
 * Three views of the same money, in the order an investigation actually runs: find the
 * posting the customer is asking about, read the entry the bank wrote for it, then check
 * that what the bank wrote agrees with what the rail settled.
 */

'use client';

import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { ReconciliationWorkbench } from '@/components/finance';
import { OpsScreen } from '@/components/ops';

import { JournalSearch } from './journal-search';
import { PostingSearch } from './posting-search';

/** Posting search, the journal, and the reconciliation workbench. */
export function TransactionsScreen() {
  return (
    <OpsScreen
      title="Transaction operations"
      description="Search every posting in the bank, inspect both sides of the entry behind it, and reconcile the book against the rails."
    >
      <Tabs defaultValue="postings">
        <TabList label="Transaction operations">
          <Tab value="postings">Postings</Tab>
          <Tab value="journal">Journal</Tab>
          <Tab value="reconciliation">Reconciliation</Tab>
        </TabList>

        <TabPanel value="postings">
          <PostingSearch />
        </TabPanel>
        <TabPanel value="journal">
          <JournalSearch />
        </TabPanel>
        <TabPanel value="reconciliation">
          <ReconciliationWorkbench />
        </TabPanel>
      </Tabs>
    </OpsScreen>
  );
}
