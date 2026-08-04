/**
 * Card operations.
 *
 * The register is where the work happens; the authorisation log is where the answer to
 * "why was I declined" lives; the issuing ranges are the reference an operator reaches for
 * once a year and needs to be able to find.
 */

'use client';

import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { OpsScreen } from '@/components/ops';

import { AuthorisationLog } from './authorisation-log';
import { BinConfiguration } from './bin-configuration';
import { CardRegister } from './card-register';

/** The card register, the authorisation log and the issuing ranges. */
export function CardsScreen() {
  return (
    <OpsScreen
      title="Card operations"
      description="Issue, freeze and reissue cards, and read every authorisation the schemes have sent us."
    >
      <Tabs defaultValue="register">
        <TabList label="Card operations">
          <Tab value="register">Register</Tab>
          <Tab value="authorisations">Authorisations</Tab>
          <Tab value="ranges">Issuing ranges</Tab>
        </TabList>

        <TabPanel value="register">
          <CardRegister />
        </TabPanel>
        <TabPanel value="authorisations">
          <AuthorisationLog />
        </TabPanel>
        <TabPanel value="ranges">
          <BinConfiguration />
        </TabPanel>
      </Tabs>
    </OpsScreen>
  );
}
