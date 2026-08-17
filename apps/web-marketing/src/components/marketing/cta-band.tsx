import { Reveal } from '@/components/motion/reveal';
import type { SiteHref } from '@/lib/routes';

import { LinkButton } from './link-button';
import { Section } from './section';

export interface CtaBandProps {
  readonly title: string;
  readonly description: string;
  readonly primary: { readonly href: SiteHref; readonly label: string };
  readonly secondary?: { readonly href: SiteHref; readonly label: string };
}

/** The closing call to action. One per page, at the bottom, with a real alternative. */
export function CtaBand({ title, description, primary, secondary }: CtaBandProps) {
  return (
    <Section tone="inverse" spacing="tight" labelledBy="cta-band-heading">
      <Reveal className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 id="cta-band-heading" className="font-display text-3xl font-semibold text-slate-50">
            {title}
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">{description}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <LinkButton href={primary.href} size="lg">
            {primary.label}
          </LinkButton>
          {secondary ? (
            <LinkButton
              href={secondary.href}
              size="lg"
              variant="ghost"
              className="hover:bg-navy-800 border border-slate-500 text-slate-50"
            >
              {secondary.label}
            </LinkButton>
          ) : null}
        </div>
      </Reveal>
    </Section>
  );
}
