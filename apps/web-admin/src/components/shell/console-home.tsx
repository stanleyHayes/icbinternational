/**
 * The console's front door.
 *
 * Not a dashboard — the overview screen is that. This is a launcher, and it exists
 * because the first thing a new operator needs is an honest answer to "what am I allowed
 * to do here". It lists exactly the sections their permissions open, which is also the
 * quickest way for a supervisor to check that somebody's access was set up correctly.
 */

'use client';

import Link from 'next/link';

import { cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import { usePermissions } from '@/lib/permissions';
import { href } from '@/lib/routes';

import { visibleSections, type NavItem } from './nav/nav-model';
import { NAV_SECTIONS } from './nav/nav-sections';

const CARD =
  'flex h-full items-start gap-3 rounded-md border border-border bg-surface p-3 ' +
  'hover:border-border-strong hover:bg-surface-raised';

function SectionCard({ item }: Readonly<{ item: NavItem }>) {
  const Icon = item.icon;

  return (
    <li>
      <Link href={href(item.path)} className={cn(CARD, FOCUS_RING, TRANSITION_STATE)}>
        <Icon aria-hidden="true" className="text-accent mt-0.5 size-4 shrink-0" />
        <span className="flex flex-col gap-0.5">
          <span className="font-body text-fg text-sm font-medium">{item.label}</span>
          <span className="font-body text-fg-muted text-xs">{item.description}</span>
        </span>
      </Link>
    </li>
  );
}

function NoAccess() {
  return (
    <div className="border-border bg-surface rounded-md border p-6">
      <h2 className="font-display text-base font-semibold">No sections are open to you yet</h2>
      <p className="font-body text-fg-muted mt-1 text-sm">
        Your staff account is active but has no roles assigned. Ask your team lead to raise an
        access request with the security desk.
      </p>
    </div>
  );
}

/** The launcher shown at the root of the console. */
export function ConsoleHome() {
  const permissions = usePermissions();
  const sections = visibleSections(NAV_SECTIONS, permissions);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold">Operations</h1>
        <p className="font-body text-fg-muted text-sm">
          Press <kbd className="border-border rounded-sm border px-1 font-mono text-xs">⌘K</kbd> to
          search customers, transactions and investigations, or paste a record identifier to open it
          directly.
        </p>
      </header>

      {sections.length === 0 && <NoAccess />}

      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-2">
          <h2 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
            {section.label}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => (
              <SectionCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
