'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { cn, FOCUS_RING } from '@reliance/ui';

import type { NavLink, NavSection } from '@/content/navigation';

const ARROW_SIZE = 16;

/** The panel a top-level menu reveals. One column of links, one column of context. */
export function MegaMenuPanel({
  section,
  onNavigate,
}: {
  readonly section: NavSection;
  readonly onNavigate: () => void;
}) {
  return (
    <div
      id={`nav-panel-${section.id}`}
      className={cn(
        'border-border bg-surface absolute inset-x-0 top-full border-b shadow-lg',
        'motion-safe:animate-fade-in',
      )}
    >
      <div className="rb-shell grid gap-8 py-8 md:grid-cols-[1fr_18rem]">
        <ul className="grid gap-1 sm:grid-cols-2">
          {section.links.map((link) => (
            <MenuLink key={link.href} link={link} onNavigate={onNavigate} />
          ))}
        </ul>

        <div className="border-border bg-surface-sunken rounded-xl border p-5">
          <p className="text-fg-muted text-sm leading-relaxed">{section.summary}</p>
          <Link
            href={section.href}
            onClick={onNavigate}
            className={cn(
              'text-accent mt-4 inline-flex items-center gap-1.5 text-sm font-medium',
              'hover:text-accent-hover',
              FOCUS_RING,
            )}
          >
            Explore {section.label.toLowerCase()}
            <ArrowRight size={ARROW_SIZE} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MenuLink({
  link,
  onNavigate,
}: {
  readonly link: NavLink;
  readonly onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={link.href}
        onClick={onNavigate}
        className={cn(
          'group block rounded-lg p-3 transition-colors duration-(--rb-duration-fast)',
          'hover:bg-surface-sunken',
          FOCUS_RING,
        )}
      >
        <span className="text-fg flex items-center gap-1.5 font-medium">
          {link.label}
          <ArrowRight
            size={ARROW_SIZE}
            aria-hidden
            className="text-accent opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
        <span className="text-fg-muted mt-0.5 block text-sm">{link.description}</span>
      </Link>
    </li>
  );
}
