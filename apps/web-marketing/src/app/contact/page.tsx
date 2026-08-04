import { Clock, Mail, MapPin, Phone } from 'lucide-react';

import { Alert } from '@reliance/ui';

import { LeadForm } from '@/components/forms/lead-form';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { BANK } from '@/content/site';
import { pageMetadata } from '@/lib/seo/metadata';

const ICON_SIZE = 18;

export const metadata = pageMetadata({
  title: 'Contact us',
  description:
    'Phone, message or write to Reliance Bank. Lines are open seven days a week, and the lost or ' +
    'stolen card line never closes.',
  path: '/contact',
});

const CHANNELS = [
  {
    icon: Phone,
    title: 'General enquiries',
    value: BANK.phoneDisplay,
    href: `tel:${BANK.phone}`,
    detail: 'Seven days a week, 7am to 11pm',
  },
  {
    icon: Clock,
    title: 'Lost or stolen card',
    value: BANK.lostCardDisplay,
    href: `tel:${BANK.lostCardPhone}`,
    detail: 'Every hour of every day',
  },
  {
    icon: Mail,
    title: 'Email',
    value: BANK.email,
    href: `mailto:${BANK.email}`,
    detail: 'Answered within one working day',
  },
  {
    icon: MapPin,
    title: 'Registered office',
    value: `${BANK.registeredOffice.street}, ${BANK.registeredOffice.locality} ${BANK.registeredOffice.postalCode}`,
    href: null,
    detail: 'Correspondence only — not a branch',
  },
] as const;

/** The contact page: a lead form validated by the contract, plus the direct routes. */
export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Talk to us"
        description="Send us the detail and a person will read it. If it is urgent, the phone is faster — and if a card is involved, freeze it in the app first."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-16">
          <div>
            <SectionHeading
              id="enquiry-heading"
              title="Send us an enquiry"
              description="We reply to every message within one working day, to the address you give us here."
              level="subsection"
            />
            <div className="mt-8 max-w-2xl">
              <LeadForm />
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="font-display text-fg text-lg font-semibold">Other ways to reach us</h2>
            <ul className="mt-4 space-y-4">
              {CHANNELS.map((channel) => {
                const Icon = channel.icon;
                return (
                  <li
                    key={channel.title}
                    className="border-border bg-surface rounded-xl border p-4"
                  >
                    <p className="text-fg flex items-center gap-2 text-sm font-medium">
                      <Icon size={ICON_SIZE} aria-hidden className="text-accent" />
                      {channel.title}
                    </p>
                    <p className="mt-1.5">
                      {channel.href ? (
                        <a href={channel.href} className="text-fg hover:text-accent font-medium">
                          {channel.value}
                        </a>
                      ) : (
                        <span className="text-fg font-medium">{channel.value}</span>
                      )}
                    </p>
                    <p className="text-fg-muted mt-1 text-sm">{channel.detail}</p>
                  </li>
                );
              })}
            </ul>

            <Alert tone="info" title="Never send us a passcode" className="mt-6">
              We will never ask for a card PIN, a passcode or a one-time code — and you should never
              include one in a message, to us or to anyone else.
            </Alert>
          </aside>
        </div>
      </Section>

      <Section tone="surface" labelledBy="complaints-heading">
        <SectionHeading
          id="complaints-heading"
          eyebrow="Complaints"
          title="If we have got something wrong"
          description="Tell us and we will put it right. We acknowledge every complaint within three working days and aim to resolve it within eight weeks."
        />
        <div className="text-fg-muted mt-6 max-w-2xl space-y-3">
          <p>
            Write to us at{' '}
            <a href={`mailto:${BANK.complaintsEmail}`} className="text-accent font-medium">
              {BANK.complaintsEmail}
            </a>
            , call {BANK.phoneDisplay}, or raise it with anyone in a branch. You will be given a
            reference and the name of the person handling it.
          </p>
          <p>
            If you are unhappy with our final response, or if eight weeks pass without one, you can
            refer the complaint to the Financial Ombudsman Service free of charge.
          </p>
        </div>
      </Section>
    </>
  );
}
