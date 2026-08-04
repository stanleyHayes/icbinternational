import { BranchFinder } from '@/components/branches/branch-finder';
import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { Section } from '@/components/marketing/section';
import { getLocations } from '@/lib/api/public-data';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Branch and cash machine finder',
  description:
    'Find a Reliance Bank branch or cash machine, with opening hours, the services each one ' +
    'offers, and whether it has step-free access.',
  path: '/branches',
});

/** Branch and ATM finder. The whole network ships with the page so search is instant. */
export default async function BranchesPage() {
  const locations = await getLocations();
  const branches = locations.filter((location) => location.kind !== 'ATM').length;

  return (
    <>
      <PageHeader
        eyebrow="Help"
        title="Branches and cash machines"
        description={`${String(branches)} branches and a network of free-to-use cash machines. Every listing shows opening hours, the services available and whether there is step-free access.`}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/help', label: 'Help' },
        ]}
      />

      <Section spacing="tight">
        <BranchFinder locations={locations} />
      </Section>

      <CtaBand
        title="Most things do not need a branch"
        description="Opening an account, freezing a card, changing a limit and sending money all take under a minute in the app."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/help', label: 'Search the help centre' }}
      />
    </>
  );
}
