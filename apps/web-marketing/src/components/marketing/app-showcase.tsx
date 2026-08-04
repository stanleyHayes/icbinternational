import { Bell, Lock, PieChart, Snowflake } from 'lucide-react';

import { MoneyText } from '@reliance/ui';

import { APP_URL } from '@/content/site';

import { ExternalLinkButton } from './link-button';
import { Section, SectionHeading } from './section';

const ICON_SIZE = 18;

const SPENT_THIS_WEEK_MINOR = '18740';
const BUDGET_MINOR = '30000';
const BUDGET_PERCENT = 62;

const APP_FEATURES = [
  {
    icon: Bell,
    title: 'A notification the moment money moves',
    text: 'Every payment, in or out, with the merchant and the running balance.',
  },
  {
    icon: Snowflake,
    title: 'Freeze a card in one tap',
    text: 'Instantly, and unfreeze it just as fast when the card turns up in a coat pocket.',
  },
  {
    icon: PieChart,
    title: 'Spending sorted by itself',
    text: 'Categories you can correct once and we will remember.',
  },
  {
    icon: Lock,
    title: 'Sign in with a passkey',
    text: 'A fingerprint or a glance. Nothing to remember, nothing to phish.',
  },
] as const;

/** The mobile app, shown through what it does rather than a carousel of screenshots. */
export function AppShowcase() {
  return (
    <Section tone="surface" labelledBy="app-heading">
      <div className="grid gap-12 lg:grid-cols-[1fr_20rem] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            id="app-heading"
            eyebrow="The app"
            title="The bank fits in a pocket"
            description="Everything the branch can do, most of it faster, and none of it behind a phone queue."
          />

          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {APP_FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <li key={feature.title} className="flex gap-3">
                  <Icon size={ICON_SIZE} aria-hidden className="text-accent mt-1 shrink-0" />
                  <span>
                    <span className="text-fg block font-medium">{feature.title}</span>
                    <span className="text-fg-muted mt-1 block text-sm leading-relaxed">
                      {feature.text}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-10">
            <ExternalLinkButton href={APP_URL} size="lg" variant="primary">
              Go to online banking
            </ExternalLinkButton>
          </div>
        </div>

        <BudgetPreview />
      </div>
    </Section>
  );
}

/** A still of the weekly spending card. Figures rendered by the money component, as always. */
function BudgetPreview() {
  return (
    <div
      aria-hidden
      className="border-border bg-canvas mx-auto w-full max-w-xs rounded-2xl border p-5 shadow-md"
    >
      <p className="text-fg-subtle text-sm">Spent this week</p>
      <MoneyText amount={SPENT_THIS_WEEK_MINOR} currency="GBP" size="xl" muted />

      <div className="mt-4">
        <div className="rounded-pill bg-surface-sunken h-2 overflow-hidden">
          <div className="rounded-pill bg-accent h-full" style={{ width: `${BUDGET_PERCENT}%` }} />
        </div>
        <p className="text-fg-muted mt-2 flex items-baseline justify-between text-xs">
          <span>{BUDGET_PERCENT}% of your weekly budget</span>
          <MoneyText amount={BUDGET_MINOR} currency="GBP" size="sm" muted />
        </p>
      </div>

      <dl className="border-border mt-5 space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-fg-muted">Groceries</dt>
          <dd className="text-fg font-medium">42%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-fg-muted">Transport</dt>
          <dd className="text-fg font-medium">23%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-fg-muted">Eating out</dt>
          <dd className="text-fg font-medium">18%</dd>
        </div>
      </dl>
    </div>
  );
}
