import { Badge } from '@reliance/ui';

import { CtaBand } from '@/components/marketing/cta-band';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { BENEFITS, VACANCIES } from '@/content/careers';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Careers',
  description:
    'Open roles at Reliance Bank in engineering, risk, design, customer operations and financial ' +
    'crime, with published salary bands and a hiring process that respects your time.',
  path: '/careers',
});

const HIRING_STEPS = [
  {
    title: 'Application',
    text: 'A CV and two questions. No cover letter, and nothing to retype into a form.',
  },
  {
    title: 'First conversation',
    text: 'Forty-five minutes with the hiring manager about the work itself.',
  },
  {
    title: 'Practical exercise',
    text: 'Timeboxed to two hours, related to the actual job, and paid if it runs longer.',
  },
  {
    title: 'Final round',
    text: 'Two conversations in one sitting, then a decision within three working days.',
  },
] as const;

/** The careers page. */
export default function CareersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Work here"
        description="Six open roles, published salary bands, and a hiring process that fits in four steps and never asks you to build something we would ship."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <Section labelledBy="vacancies-heading">
        <SectionHeading
          id="vacancies-heading"
          eyebrow="Open roles"
          title={`${String(VACANCIES.length)} roles we are hiring for now`}
          description="Apply through the form on our contact page, choosing “Working at Reliance Bank”, and name the role."
        />
        <ul className="mt-10 space-y-4">
          {VACANCIES.map((vacancy) => (
            <li key={vacancy.title} className="border-border bg-surface rounded-xl border p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-fg text-xl font-semibold">{vacancy.title}</h3>
                  <p className="text-fg-muted mt-1 text-sm">
                    {vacancy.team} · {vacancy.location}
                  </p>
                </div>
                <Badge tone="accent">{vacancy.arrangement}</Badge>
              </div>
              <p className="text-fg-muted mt-4 max-w-3xl leading-relaxed">{vacancy.summary}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="surface" labelledBy="benefits-heading">
        <SectionHeading
          id="benefits-heading"
          eyebrow="What we offer"
          title="Stated as facts, not adjectives"
        />
        <dl className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title}>
              <dt className="font-display text-fg text-lg font-semibold">{benefit.title}</dt>
              <dd className="text-fg-muted mt-2 leading-relaxed">{benefit.text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section labelledBy="hiring-heading">
        <SectionHeading
          id="hiring-heading"
          eyebrow="How we hire"
          title="Four steps, three weeks, one decision"
          description="You will always know which step you are on and when you will hear next."
        />
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {HIRING_STEPS.map((step, index) => (
            <li key={step.title} className="border-border bg-surface rounded-xl border p-6">
              <span className="font-display text-accent text-3xl font-semibold">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-fg mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="text-fg-muted mt-2 text-sm leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <CtaBand
        title="Nothing quite right?"
        description="Tell us what you do and why this is the bank you want to do it at. We read every one."
        primary={{ href: '/contact', label: 'Send an application' }}
        secondary={{ href: '/about', label: 'Read about the bank' }}
      />
    </>
  );
}
