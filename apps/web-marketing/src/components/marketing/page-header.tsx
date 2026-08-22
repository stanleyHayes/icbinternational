import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn, FOCUS_RING } from '@reliance/ui';

import { FadeIn, LINE_STAGGER_MS, TextReveal } from '@/components/motion/text-reveal';
import type { Photograph } from '@/content/photography';
import type { SiteHref } from '@/lib/routes';

import { Eyebrow } from './eyebrow';

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
  /** Scene photograph for the pages that earn one. Omitted, the header stays all type. */
  readonly image?: Photograph;
}

/**
 * The opening block of every page below the home page.
 *
 * The breadcrumb is a real `<nav>` with an ordered list: it is how a customer who arrived
 * from a search result works out where in the bank they have landed, and it is the only
 * upward navigation on a small screen once the header menu is closed.
 */
/** The trail above the title, and the only upward navigation once the menu is closed. */
function Breadcrumbs({
  breadcrumbs,
  title,
}: {
  readonly breadcrumbs?: readonly Crumb[];
  readonly title: string;
}) {
  if (!breadcrumbs || breadcrumbs.length === 0) return null;

  return (
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
  );
}

export function PageHeader(props: PageHeaderProps) {
  const { title, description, eyebrow, breadcrumbs, image, children } = props;

  return (
    <div className="border-border bg-surface border-b">
      <div
        className={cn(
          'rb-shell py-12 md:py-16',
          image && 'lg:grid lg:grid-cols-[1fr_24rem] lg:items-center lg:gap-12',
        )}
      >
        <div>
          <Breadcrumbs breadcrumbs={breadcrumbs} title={title} />
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}

          <h1 className="font-display text-fg mt-3 max-w-3xl text-4xl font-semibold md:text-5xl">
            <TextReveal lines={[title]} />
          </h1>
          <FadeIn delay={LINE_STAGGER_MS}>
            <p className="text-fg-muted mt-5 max-w-2xl text-lg leading-relaxed">{description}</p>
          </FadeIn>

          {children ? <div className="mt-8">{children}</div> : null}
        </div>

        {image ? (
          <Image
            src={image.src}
            width={image.width}
            height={image.height}
            alt=""
            sizes="(min-width: 1024px) 24rem, 100vw"
            className="border-border mt-10 aspect-3/2 w-full rounded-2xl border object-cover lg:mt-0"
          />
        ) : null}
      </div>
    </div>
  );
}
