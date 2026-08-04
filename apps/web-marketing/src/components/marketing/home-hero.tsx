import { ShieldCheck, Zap } from 'lucide-react';

import { MoneyText } from '@reliance/ui';

import { DEPOSIT_PROTECTION } from '@/content/site';
import { formatAer } from '@/lib/format';

import { LinkButton } from './link-button';

const ICON_SIZE = 16;

/** The example balance in the phone mock-up, in integer minor units. */
const EXAMPLE_BALANCE_MINOR = '482350';
const EXAMPLE_SAVED_MINOR = '125000';
const EXAMPLE_SALARY_MINOR = '284700';
const EXAMPLE_GROCERIES_MINOR = '-4285';

/**
 * The home page hero.
 *
 * The savings rate is passed in rather than hard-coded: it is the single most consequential
 * number on the site, and a stale one in a hero is a mis-selling problem, not a typo.
 */
export function HomeHero({ savingsRateBps }: { readonly savingsRateBps: number }) {
  return (
    <section className="border-border bg-surface relative overflow-hidden border-b">
      <div className="rb-shell grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div>
          <p className="rounded-pill bg-accent-soft text-accent inline-flex items-center gap-2 px-3 py-1 text-sm font-medium">
            <Zap size={ICON_SIZE} aria-hidden />
            {formatAer(savingsRateBps)} on easy-access savings
          </p>

          <h1 className="font-display text-fg mt-6 max-w-2xl text-4xl leading-[1.05] font-semibold md:text-6xl">
            Banking you can stand on.
          </h1>

          <p className="text-fg-muted mt-6 max-w-xl text-lg leading-relaxed md:text-xl">
            A current account with no monthly fee, savings that pay interest every month, and
            lending that tells you the total cost before you apply. Open one in about five minutes.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/open-an-account" size="lg">
              Open an account
            </LinkButton>
            <LinkButton href="/rates-and-fees" size="lg" variant="secondary">
              See every rate and fee
            </LinkButton>
          </div>

          <p className="text-fg-muted mt-6 flex items-center gap-2 text-sm">
            <ShieldCheck size={ICON_SIZE} aria-hidden className="text-accent" />
            Eligible deposits protected up to {DEPOSIT_PROTECTION.limitLabel} by the{' '}
            {DEPOSIT_PROTECTION.schemeShort}
          </p>
        </div>

        <AccountPreview />
      </div>
    </section>
  );
}

/**
 * A still of the account screen.
 *
 * Every figure goes through `MoneyText`, so even an illustration cannot invent a
 * formatting convention the real product does not use.
 */
function AccountPreview() {
  return (
    <div
      aria-hidden
      className="border-border bg-canvas mx-auto w-full max-w-xs rounded-2xl border p-5 shadow-lg"
    >
      <p className="text-fg-subtle text-sm">Available balance</p>
      <MoneyText amount={EXAMPLE_BALANCE_MINOR} currency="GBP" size="display" muted />

      <div className="bg-accent-soft mt-4 rounded-lg p-3">
        <p className="text-accent text-xs font-medium">Set aside this month</p>
        <MoneyText amount={EXAMPLE_SAVED_MINOR} currency="GBP" size="lg" />
      </div>

      <ul className="border-border mt-5 space-y-3 border-t pt-4">
        <PreviewRow title="Salary" detail="Beckett & Rowe" amount={EXAMPLE_SALARY_MINOR} />
        <PreviewRow title="Groceries" detail="Marlow Market" amount={EXAMPLE_GROCERIES_MINOR} />
      </ul>
    </div>
  );
}

function PreviewRow({
  title,
  detail,
  amount,
}: {
  readonly title: string;
  readonly detail: string;
  readonly amount: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span>
        <span className="text-fg block text-sm font-medium">{title}</span>
        <span className="text-fg-subtle block text-xs">{detail}</span>
      </span>
      <MoneyText amount={amount} currency="GBP" size="sm" signed />
    </li>
  );
}
