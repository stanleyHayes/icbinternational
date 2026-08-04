import { Bell, Eye, Fingerprint, KeyRound, Radar, ShieldCheck } from 'lucide-react';

import { Alert } from '@reliance/ui';

import { CtaBand } from '@/components/marketing/cta-band';
import { FaqList } from '@/components/marketing/faq-list';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { BANK } from '@/content/site';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Security centre',
  description:
    'How Reliance Bank protects your account, what we will never ask you for, and the settings ' +
    'you can change today to make your account harder to attack.',
  path: '/security',
});

const PROTECTIONS = [
  {
    icon: Fingerprint,
    title: 'Passkeys instead of passwords',
    description:
      'Your key never leaves your device and is bound to our real domain, so a convincing copy of ' +
      'our site cannot collect it.',
  },
  {
    icon: Radar,
    title: 'Every payment scored before it moves',
    description:
      'Amount, payee, device, location and history are checked in the moments before a payment ' +
      'leaves. Unusual ones are challenged, not silently declined.',
  },
  {
    icon: Bell,
    title: 'You are told immediately',
    description:
      'Every payment, every new payee, every change to a limit or a device raises a notification ' +
      'you cannot turn off.',
  },
  {
    icon: KeyRound,
    title: 'Step-up for the decisions that matter',
    description:
      'A new payee, a large transfer or a change of contact details asks you to prove it is you ' +
      'again, even inside a live session.',
  },
  {
    icon: Eye,
    title: 'A record you can read',
    description:
      'Every device, every session and every security change is listed in the app with a date, and ' +
      'you can end any session from any other one.',
  },
  {
    icon: ShieldCheck,
    title: 'Refunds where you were not at fault',
    description:
      'Unauthorised payments are refunded, and we do not make you argue for it. Report it and we ' +
      'investigate while your money is back.',
  },
] as const;

const CUSTOMER_STEPS = [
  'Register a passkey, and register a second one on another device so a lost phone is not a lockout.',
  'Turn off any card capability you do not use — contactless, online payments, cash abroad.',
  'Set a per-payment limit that fits how you actually spend, not the maximum we allow.',
  'Check the device list in the app every few months and remove anything you no longer own.',
  'Never approve a payment or read out a code because someone on the phone asked you to.',
];

const QUESTIONS = [
  {
    question: 'What will Reliance Bank never ask me for?',
    answer:
      'A one-time code, your card PIN, your passcode, or your full card number. Not by phone, not ' +
      'by email, not in the app, not ever.',
  },
  {
    question: 'Someone called saying they were from your fraud team. Was it you?',
    answer:
      'Hang up and call us on the number on the back of your card, or dial 159, which connects you ' +
      'to your bank and cannot be intercepted. Caller ID can be forged.',
  },
  {
    question: 'I clicked a link in a suspicious message. What now?',
    answer:
      'Freeze your card in the app, change your passcode, and report it. If you entered any detail ' +
      'at all, call us straight away — the sooner we know, the more we can stop.',
  },
  {
    question: 'Do you support two-factor authentication?',
    answer:
      'Yes, and passkeys are stronger still. You can enrol an authenticator app, a passkey, or ' +
      'both. We recommend both, on separate devices.',
  },
];

/** The security centre. */
export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Security centre"
        description="What we do to protect your account, what you can do today to make it harder to attack, and the one rule that stops most fraud before it starts."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      >
        <Alert tone="danger" title="If you think someone has access to your account">
          Call us on {BANK.phoneDisplay} straight away, or dial 159 from any phone to be connected
          to your bank. If a card is involved, freeze it in the app first — it takes one tap and it
          is instant.
        </Alert>
      </PageHeader>

      <Section labelledBy="protections-heading">
        <SectionHeading
          id="protections-heading"
          eyebrow="What we do"
          title="Six layers, all of them on by default"
          description="None of these is an upgrade, an add-on, or something you have to find in a settings menu."
        />
        <FeatureGrid features={PROTECTIONS} className="mt-12" />
      </Section>

      <Section tone="surface" labelledBy="customer-steps-heading">
        <SectionHeading
          id="customer-steps-heading"
          eyebrow="What you can do"
          title="Five things worth doing this week"
          description="Each takes under a minute and closes a route an attacker would otherwise use."
        />
        <ol className="mt-8 max-w-3xl space-y-3">
          {CUSTOMER_STEPS.map((step, index) => (
            <li
              key={step}
              className="border-border bg-surface flex gap-4 rounded-lg border px-5 py-4"
            >
              <span className="font-display text-accent text-lg font-semibold">{index + 1}</span>
              <span className="text-fg-muted">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section labelledBy="security-faq-heading">
        <SectionHeading id="security-faq-heading" title="Questions about security" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Know the shape of a scam"
        description="Almost every case we see has the same five signals. Learning them takes five minutes."
        primary={{ href: '/security/fraud', label: 'Read the fraud guide' }}
        secondary={{ href: '/contact', label: 'Report something suspicious' }}
      />
    </>
  );
}
