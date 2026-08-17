import type { ReactNode } from 'react';

import { cn } from '@reliance/ui';

import { Reveal } from '@/components/motion/reveal';

/** Vertical rhythm. Three densities, so the page has a shape rather than a uniform stripe. */
const SPACING = {
  tight: 'py-12 md:py-16',
  base: 'py-16 md:py-24',
  loose: 'py-20 md:py-32',
} as const;

/** Background treatment. `sunken` separates a band without adding a border. */
const TONE = {
  canvas: '',
  surface: 'bg-surface',
  sunken: 'bg-surface-sunken',
  inverse: 'bg-navy-900 text-slate-50',
} as const;

export interface SectionProps {
  readonly children: ReactNode;
  readonly id?: string;
  readonly spacing?: keyof typeof SPACING;
  readonly tone?: keyof typeof TONE;
  /** Applies to the outer band; the inner shell keeps the page gutter. */
  readonly className?: string;
  /** Announced as the section's name when the heading is rendered inside it. */
  readonly labelledBy?: string;
}

/** A full-bleed band with the page's gutter applied inside it. */
export function Section(props: SectionProps) {
  const { children, id, spacing = 'base', tone = 'canvas', labelledBy } = props;

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(SPACING[spacing], TONE[tone], props.className)}
    >
      <div className="rb-shell">{children}</div>
    </section>
  );
}

/** Where the heading sits in the document outline. */
export type HeadingLevel = 'section' | 'subsection';

export interface SectionHeadingProps {
  readonly title: string;
  readonly id?: string;
  /** Small line above the title. Names the topic, never repeats the title. */
  readonly eyebrow?: string;
  readonly description?: string;
  /** `center` for bands that stand alone; the default reads faster in a dense page. */
  readonly align?: 'start' | 'center';
  /** `section` renders an `<h2>`; `subsection` an `<h3>`, for a heading nested under one. */
  readonly level?: HeadingLevel;
}

/** The heading block that opens a section. Reveals itself as it scrolls into view. */
export function SectionHeading(props: SectionHeadingProps) {
  const { title, id, eyebrow, description, align = 'start', level = 'section' } = props;
  const isSection = level === 'section';
  const Tag = isSection ? 'h2' : 'h3';

  return (
    <Reveal className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow ? (
        <p className="text-accent text-xs font-semibold tracking-widest uppercase">{eyebrow}</p>
      ) : null}
      <Tag
        id={id}
        className={cn(
          'font-display text-fg font-semibold',
          isSection ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl',
          eyebrow && 'mt-3',
        )}
      >
        {title}
      </Tag>
      {description ? (
        <p className="text-fg-muted mt-4 text-lg leading-relaxed">{description}</p>
      ) : null}
    </Reveal>
  );
}
