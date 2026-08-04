'use client';

/**
 * The desktop menu bar. State lives in the header; this renders it.
 *
 * `aria-controls` is claimed only while a section is expanded. The panel it names is mounted with
 * the panel, so pointing at that id from a collapsed trigger is a dangling IDREF — assistive
 * technology resolves it to nothing, and the relationship the attribute promises does not exist.
 * `aria-expanded` already tells the customer the trigger discloses something.
 */

import { ChevronDown } from 'lucide-react';

import { cn, FOCUS_RING } from '@reliance/ui';

import { NAV_SECTIONS, type NavSection } from '@/content/navigation';

const CHEVRON_SIZE = 15;

/**
 * The id of the panel a section reveals.
 *
 * Must agree with `MegaMenuPanel`, which is owned elsewhere and still builds the id inline; see
 * `docs/HANDOFFS.md`.
 */
export function navPanelId(sectionId: string): string {
  return `nav-panel-${sectionId}`;
}

/** Hands a trigger element to whoever needs to move focus to it. `null` on unmount. */
export type RegisterTrigger = (id: string, element: HTMLButtonElement | null) => void;

/** Props for {@link PrimaryNav}. */
export interface PrimaryNavProps {
  readonly openSection: string | null;
  readonly onToggle: (id: string) => void;
  /** Lets the header return focus to the trigger whose panel Escape has just closed. */
  readonly registerTrigger?: RegisterTrigger;
}

interface NavTriggerProps {
  readonly section: NavSection;
  readonly expanded: boolean;
  readonly onToggle: (id: string) => void;
  readonly registerTrigger?: RegisterTrigger;
}

/** One top-level trigger. */
function NavTrigger({ section, expanded, onToggle, registerTrigger }: NavTriggerProps) {
  return (
    <li>
      <button
        type="button"
        ref={(element) => {
          registerTrigger?.(section.id, element);
        }}
        aria-expanded={expanded}
        {...(expanded ? { 'aria-controls': navPanelId(section.id) } : {})}
        onClick={() => onToggle(section.id)}
        className={cn(
          'text-fg-muted flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium',
          'hover:bg-surface-sunken hover:text-fg transition-colors duration-(--rb-duration-fast)',
          expanded && 'bg-surface-sunken text-fg',
          FOCUS_RING,
        )}
      >
        {section.label}
        <ChevronDown
          size={CHEVRON_SIZE}
          aria-hidden
          className={cn(
            'transition-transform duration-(--rb-duration-fast)',
            expanded && 'rotate-180',
          )}
        />
      </button>
    </li>
  );
}

/**
 * @example <PrimaryNav openSection={open} onToggle={toggle} registerTrigger={register} />
 */
export function PrimaryNav({ openSection, onToggle, registerTrigger }: PrimaryNavProps) {
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {NAV_SECTIONS.map((section) => (
          <NavTrigger
            key={section.id}
            section={section}
            expanded={openSection === section.id}
            onToggle={onToggle}
            {...(registerTrigger ? { registerTrigger } : {})}
          />
        ))}
      </ul>
    </nav>
  );
}
