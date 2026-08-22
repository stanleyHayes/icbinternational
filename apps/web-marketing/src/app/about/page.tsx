import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { TrustBand } from '@/components/marketing/trust-band';
import { SCENES } from '@/content/photography';
import { BANK, REGULATORY_STATEMENT } from '@/content/site';
import { getCmsPage } from '@/lib/api/public-data';
import { pageMetadata } from '@/lib/seo/metadata';

const FALLBACK_TITLE = 'About Reliance Bank';
const FALLBACK_DESCRIPTION =
  'A bank built around one idea: a customer should never be surprised by their own money. Who ' +
  'we are, how we are governed, and what we will not do.';

export async function generateMetadata() {
  const page = await getCmsPage('about');

  return pageMetadata({
    title: page?.seo.title ?? FALLBACK_TITLE,
    description: page?.seo.description ?? FALLBACK_DESCRIPTION,
    path: '/about',
  });
}

const PRINCIPLES = [
  {
    title: 'Publish the price',
    text:
      'Every rate, fee and limit is on one page, in full, before anyone opens an account. A charge ' +
      'that only appears on a statement is a charge we should not be making.',
  },
  {
    title: 'No introductory anything',
    text:
      'No teaser rates that lapse, no fees waived for six months, no bundle you have to keep to ' +
      'hold the price. The terms on the day you join are the terms in year five.',
  },
  {
    title: 'Say it before it happens',
    text:
      'Fourteen days’ notice before a rate falls, sixty before a new charge, and an alert before a ' +
      'payment would take you overdrawn — while there is still time to act.',
  },
  {
    title: 'Money is a fact, not an estimate',
    text:
      'Every balance in this bank is derived from a double-entry ledger and reconciled daily. ' +
      'Nothing is rounded, nothing is approximated, and nothing is adjusted by hand.',
  },
] as const;

const TIMELINE = [
  { year: '2016', text: 'Founded in London with a banking licence and eleven people.' },
  {
    year: '2018',
    text: 'Current accounts and cards launched. The first fee page fitted on one screen; it still does.',
  },
  { year: '2020', text: 'Business banking, multi-user approvals and payroll.' },
  {
    year: '2022',
    text: 'Multi-currency wallets in twenty-five currencies, converted at the network rate.',
  },
  { year: '2024', text: 'Passkeys replaced passwords as the default way to sign in.' },
  { year: '2026', text: '1.4 million personal and business customers, and sixty branches.' },
] as const;

/** The about page. */
export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Company"
        title={FALLBACK_TITLE}
        description={FALLBACK_DESCRIPTION}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
        image={SCENES.about}
      />

      <TrustBand />

      <Section labelledBy="principles-heading">
        <SectionHeading
          id="principles-heading"
          eyebrow="What we hold to"
          title="Four principles, and what each one costs us"
          description="Every one of these is a decision that some part of the business would prefer we had not made."
        />
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {PRINCIPLES.map((principle) => (
            <li key={principle.title} className="border-border bg-surface rounded-xl border p-6">
              <h3 className="font-display text-fg text-xl font-semibold">{principle.title}</h3>
              <p className="text-fg-muted mt-3 leading-relaxed">{principle.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="surface" labelledBy="timeline-heading">
        <SectionHeading id="timeline-heading" eyebrow="History" title="How we got here" />
        <ol className="border-border mt-10 max-w-3xl space-y-6 border-l pl-6">
          {TIMELINE.map((entry) => (
            <li key={entry.year} className="relative">
              <span
                aria-hidden
                className="rounded-pill bg-accent ring-surface absolute top-2 -left-[1.9rem] size-2.5 ring-4"
              />
              <h3 className="font-display text-fg text-lg font-semibold">{entry.year}</h3>
              <p className="text-fg-muted mt-1 leading-relaxed">{entry.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section labelledBy="governance-heading">
        <SectionHeading id="governance-heading" eyebrow="Governance" title="Who we answer to" />
        <div className="text-fg-muted mt-6 max-w-3xl space-y-4">
          <p>{REGULATORY_STATEMENT}</p>
          <p>
            {BANK.legalName} is supervised by both the Prudential Regulation Authority, which is
            responsible for our financial resilience, and the Financial Conduct Authority, which is
            responsible for how we treat customers. Our annual report and our Pillar 3 disclosures
            are published each year and are available on request.
          </p>
          <p>
            Press enquiries:{' '}
            <a href={`mailto:${BANK.pressEmail}`} className="text-accent font-medium">
              {BANK.pressEmail}
            </a>
            .
          </p>
        </div>
      </Section>

      <CtaBand
        title="Come and build it"
        description="We hire engineers, risk specialists, designers and people who like talking to customers."
        primary={{ href: '/careers', label: 'See open roles' }}
        secondary={{ href: '/contact', label: 'Get in touch' }}
      />
    </>
  );
}
