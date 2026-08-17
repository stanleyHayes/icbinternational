import { RevealGroup } from '@/components/motion/reveal-group';
import { TRUST_STATS } from '@/content/testimonials';
import type { TrustStat } from '@/content/testimonials';

import { Section } from './section';

/** One figure and its label. The `<div>` pairing them in the list is the reveal wrapper. */
function TrustStatItem({ stat }: { readonly stat: TrustStat }) {
  return (
    <>
      <dt className="font-display text-fg text-3xl font-semibold">{stat.value}</dt>
      <dd className="mt-1">
        <span className="text-fg block text-sm font-medium">{stat.label}</span>
        <span className="text-fg-muted mt-1 block text-sm leading-relaxed">{stat.detail}</span>
      </dd>
    </>
  );
}

/**
 * The figures a prospective customer wants before anything else.
 *
 * A `<dl>` rather than a row of divs: the value and its label are a pair, and pairing them
 * in markup is what lets a screen reader read "£85,000, protected per person" instead of
 * two unrelated fragments.
 */
export function TrustBand() {
  return (
    <Section tone="sunken" spacing="tight" labelledBy="trust-band-heading">
      <h2 id="trust-band-heading" className="sr-only">
        Why customers trust Reliance Bank
      </h2>
      <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <RevealGroup as="div">
          {TRUST_STATS.map((stat) => (
            <TrustStatItem key={stat.label} stat={stat} />
          ))}
        </RevealGroup>
      </dl>
    </Section>
  );
}
