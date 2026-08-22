import { Globe, Lock, Nfc, ShieldCheck, Snowflake, Wallet } from 'lucide-react';

import { CardArt } from '@reliance/ui';

import { CtaBand } from '@/components/marketing/cta-band';
import { FaqList } from '@/components/marketing/faq-list';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PageHeader } from '@/components/marketing/page-header';
import { Section, SectionHeading } from '@/components/marketing/section';
import { FeeTable } from '@/components/rates/fee-table';
import { getFees } from '@/lib/api/public-data';
import { feeEntries } from '@/lib/fees';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Debit and credit cards',
  description:
    'A contactless debit card with limits you set yourself, a virtual card in seconds, and a ' +
    'freeze that takes one tap. Every card charge published in full.',
  path: '/personal/cards',
});

const CONTROLS = [
  {
    icon: Snowflake,
    title: 'Freeze and unfreeze instantly',
    description:
      'One tap stops every new payment. Unfreezing is just as fast, so a card mislaid in a coat ' +
      'pocket does not have to become a replacement.',
  },
  {
    icon: Lock,
    title: 'Your own limits, not ours',
    description:
      'Set a per-payment ceiling, a daily spend cap and a separate cash limit. Lower them for a ' +
      'trip and raise them again when you are home.',
  },
  {
    icon: Nfc,
    title: 'Switch off what you do not use',
    description:
      'Contactless, online payments, cash machines and payments abroad can each be turned off ' +
      'independently. A capability you never use is a capability nobody can abuse.',
  },
  {
    icon: Wallet,
    title: 'Virtual cards in seconds',
    description:
      'Create a card for a single subscription, lock it to that merchant, and delete it the day ' +
      'you cancel.',
  },
  {
    icon: Globe,
    title: 'No mark-up on the exchange rate',
    description:
      'Card payments abroad are converted at the network rate. The first three cash withdrawals ' +
      'abroad each month are free.',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud checks that learn',
    description:
      'Unusual payments are challenged in the app, not declined in front of a queue. Approve it ' +
      'and it completes immediately.',
  },
] as const;

const QUESTIONS = [
  {
    question: 'How quickly does a replacement card arrive?',
    answer:
      'Two to three working days as standard, and free the first time each year. In the meantime ' +
      'a virtual card is available immediately for online and wallet payments.',
  },
  {
    question: 'Is there a credit card?',
    answer:
      'Yes, subject to a full application and affordability assessment. The representative APR ' +
      'and the total cost of borrowing are shown before you apply.',
  },
  {
    question: 'What if I do not recognise a payment?',
    answer:
      'Report it in the app. We freeze the card, open a dispute and, where the payment was not ' +
      'authorised by you, refund it while we investigate.',
  },
  {
    question: 'Can I add the card to a phone wallet?',
    answer:
      'Yes, on both Apple and Google wallets, including virtual cards. Wallet payments use a ' +
      'device token rather than the card number itself.',
  },
];

/** The cards page. */
export default async function CardsPage() {
  const fees = feeEntries(await getFees());
  const cardFees = fees.filter((fee) => fee.kind.startsWith('CARD') || fee.kind.startsWith('ATM'));

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Cards you are actually in charge of"
        description="Every control that matters sits in the app: limits, contactless, online payments, cash abroad, and a freeze that takes one tap."
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/personal', label: 'Personal' },
        ]}
      />

      <Section labelledBy="card-range-heading">
        <SectionHeading
          id="card-range-heading"
          eyebrow="The range"
          title="Three cards, one set of controls"
          description="Whichever you hold, the app treats it the same way."
        />
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <CardArt
              tier="standard"
              network="visa"
              medium="physical"
              holder="A OKONJO"
              last4="4417"
              expiry="09/30"
            />
            <h3 className="font-display text-fg mt-4 text-lg font-semibold">Everyday debit</h3>
            <p className="text-fg-muted mt-1 text-sm leading-relaxed">
              Included with the Current Account Plus, at no charge.
            </p>
          </li>
          <li>
            <CardArt
              tier="premium"
              network="mastercard"
              medium="physical"
              holder="A OKONJO"
              last4="9042"
              expiry="04/31"
            />
            <h3 className="font-display text-fg mt-4 text-lg font-semibold">Premium debit</h3>
            <p className="text-fg-muted mt-1 text-sm leading-relaxed">
              Higher cash limits abroad and travel cover, on the Premium account.
            </p>
          </li>
          <li>
            <CardArt
              tier="standard"
              network="visa"
              medium="virtual"
              holder="A OKONJO"
              last4="7761"
              expiry="11/29"
            />
            <h3 className="font-display text-fg mt-4 text-lg font-semibold">Virtual card</h3>
            <p className="text-fg-muted mt-1 text-sm leading-relaxed">
              Created in seconds, locked to one merchant, deleted whenever you like.
            </p>
          </li>
        </ul>
      </Section>

      <Section tone="surface" labelledBy="controls-heading">
        <SectionHeading
          id="controls-heading"
          eyebrow="Controls"
          title="Six switches, all of them yours"
        />
        <FeatureGrid features={CONTROLS} className="mt-12" />
      </Section>

      <Section labelledBy="card-fees-heading">
        <SectionHeading
          id="card-fees-heading"
          eyebrow="Charges"
          title="What a card can cost you"
          description="The complete list. Everything else about the card is free."
        />
        <div className="mt-8">
          <FeeTable fees={cardFees} />
        </div>
      </Section>

      <Section tone="surface" labelledBy="cards-faq-heading">
        <SectionHeading id="cards-faq-heading" title="Questions about cards" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={QUESTIONS} />
        </div>
      </Section>

      <CtaBand
        title="Get a card with your account"
        description="Your virtual card is ready the moment the account opens; the physical one follows in the post."
        primary={{ href: '/open-an-account', label: 'Open an account' }}
        secondary={{ href: '/security', label: 'How we protect your card' }}
      />
    </>
  );
}
