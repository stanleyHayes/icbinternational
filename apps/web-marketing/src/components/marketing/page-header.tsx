import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn, FOCUS_RING } from '@reliance/ui';

import { FadeIn, LINE_STAGGER_MS, TextReveal } from '@/components/motion/text-reveal';
import type { SiteHref } from '@/lib/routes';

/** One step in the trail above a page title. */
export interface Crumb {
  readonly href: SiteHref;
  readonly label: string;
}

export interface PageHeaderProps {
  readonly title: string;
  readonly description: string;
  readonly eyebrow?: string;
  readonly breadcrumbs?: readonly Crumb[];
  /** Buttons or a short list of facts, rendered under the description. */
  readonly children?: ReactNode;
}

/**
 * The opening block of every page below the home page.
 *
 * The breadcrumb is a real `<nav>` with an ordered list: it is how a customer who arrived
 * from a search result works out where in the bank they have landed, and it is the only
 * upward navigation on a small screen once the header menu is closed.
 */
export function PageHeader(props: PageHeaderProps) {
  const { title, description, eyebrow, breadcrumbs, children } = props;

  return (
    <div className="border-border bg-surface border-b">
      <div className="rb-shell py-12 md:py-16">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {breadcrumbs.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-2">
                  <Link href={crumb.href} className={cn('hover:text-fg rounded-sm', FOCUS_RING)}>
                    {crumb.label}
                  </Link>
                  <span aria-hidden className="text-fg-subtle">
                    /
                  </span>
                </li>
              ))}
              <li aria-current="page" className="text-fg">
                {title}
              </li>
            </ol>
          </nav>
        ) : null}

        {eyebrow ? (
          <p className="text-accent text-xs font-semibold tracking-widest uppercase">{eyebrow}</p>
        ) : null}

        <h1 className="font-display text-fg mt-3 max-w-3xl text-4xl font-semibold md:text-5xl">
          <TextReveal lines={[title]} />
        </h1>
        <FadeIn delay={LINE_STAGGER_MS}>
          <p className="text-fg-muted mt-5 max-w-2xl text-lg leading-relaxed">{description}</p>
        </FadeIn>

        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </div>
  );
}
