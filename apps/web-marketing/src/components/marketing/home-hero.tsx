import { ShieldCheck } from 'lucide-react';
import Image from 'next/image';

import { cn, MoneyText } from '@reliance/ui';

import { FadeIn, LINE_STAGGER_MS, TextReveal } from '@/components/motion/text-reveal';
import { SCENES } from '@/content/photography';
import { DEPOSIT_PROTECTION } from '@/content/site';

import { LinkButton } from './link-button';
import { RateQuote } from './rate-quote';

const ICON_SIZE = 16;

/** The hero headline, as authored — one line, revealed out of its mask on mount. */
const HEADLINE_LINES = ['Banking you can stand on.'];

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
interface HomeHeroProps {
  /** `null` when the build could not reach the bank — the hero then makes no rate claim. */
  readonly savingsRateBps: number | null;
  readonly rateEffectiveFrom?: string;
}

export function HomeHero({ savingsRateBps, rateEffectiveFrom }: HomeHeroProps) {
  return (
    <section className="border-border bg-surface relative overflow-hidden border-b">
      <div className="rb-shell grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div>
          <RateQuote
            basisPoints={savingsRateBps}
            unit="AER"
            basis="variable, on easy-access savings"
            effectiveFrom={rateEffectiveFrom}
          />

          <h1 className="font-display text-fg mt-6 max-w-2xl text-4xl leading-[1.05] font-semibold md:text-6xl">
            <TextReveal lines={HEADLINE_LINES} />
          </h1>

          <FadeIn delay={HEADLINE_LINES.length * LINE_STAGGER_MS}>
            <p className="text-fg-muted mt-6 max-w-xl text-lg leading-relaxed md:text-xl">
              A current account with no monthly fee, savings that pay interest every month, and
              lending that tells you the total cost before you apply. Open one in about five
              minutes.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/open-an-account" size="lg">
                Open an account
              </LinkButton>
              <LinkButton href="/rates-and-fees" size="lg" variant="secondary">
                See every rate and fee
              </LinkButton>
            </div>
          </FadeIn>

          <p className="text-fg-muted mt-6 flex items-center gap-2 text-sm">
            <ShieldCheck size={ICON_SIZE} aria-hidden className="text-accent" />
            Eligible deposits protected up to {DEPOSIT_PROTECTION.limitLabel} by the{' '}
            {DEPOSIT_PROTECTION.schemeShort}
          </p>
        </div>

        <HeroShowcase />
      </div>
    </section>
  );
}

/**
 * The photograph, with the account screen sitting over its lower edge.
 *
 * The shot was framed with empty floor in the bottom third precisely so the card could
 * land there without covering anyone. The card is pulled up over the photo rather than
 * absolutely positioned, so it keeps its place at every width instead of needing a
 * breakpoint per overlap.
 */
function HeroShowcase() {
  return (
    <div className="mx-auto w-full max-w-xs lg:max-w-none">
      <Image
        src={SCENES.home.src}
        width={SCENES.home.width}
        height={SCENES.home.height}
        alt=""
        priority
        sizes="(min-width: 1024px) 22rem, 20rem"
        className="border-border aspect-3/4 w-full rounded-2xl border object-cover"
      />
      <AccountPreview className="relative z-10 -mt-20 w-[88%]" />
    </div>
  );
}

/**
 * A still of the account screen.
 *
 * Every figure goes through `MoneyText`, so even an illustration cannot invent a
 * formatting convention the real product does not use.
 */
function AccountPreview({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'border-border bg-canvas mx-auto w-full max-w-xs rounded-2xl border p-5 shadow-lg',
        className,
      )}
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
