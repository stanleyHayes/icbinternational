/**
 * The console's sidebar.
 *
 * It renders exactly what the signed-in operator's permissions allow and nothing else —
 * no greyed-out rows, no padlocks. An operator should not spend eight hours a day reading
 * past controls they will never be able to use, and a list of what you are forbidden to
 * do is itself information the bank has no reason to publish inside its own console.
 */

'use client';

import { usePermissions } from '@/lib/permissions';
import { isSectionActive } from '@/lib/routes';

import { NavLink } from './nav-link';
import { visibleSections } from './nav-model';
import { NAV_SECTIONS } from './nav-sections';

const SECTION_HEADING =
  'px-2.5 pb-1 font-body text-xs font-semibold uppercase tracking-wider text-fg-subtle';

export interface SidebarNavProps {
  /** The path currently rendered, used to mark the active row. */
  readonly currentPath: string;
  /** Called after a destination is chosen, so a mobile drawer can close. */
  readonly onNavigate?: () => void;
}

/** The permission-filtered list of destinations. */
export function SidebarNav({ currentPath, onNavigate }: SidebarNavProps) {
  const permissions = usePermissions();
  const sections = visibleSections(NAV_SECTIONS, permissions);

  return (
    <nav aria-label="Console sections" className="flex flex-col gap-4 px-2 py-3">
      {sections.map((section) => (
        <div key={section.id}>
          <h2 id={`nav-${section.id}`} className={SECTION_HEADING}>
            {section.label}
          </h2>
          <ul aria-labelledby={`nav-${section.id}`} className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.id}>
                <NavLink
                  item={item}
                  active={isSectionActive(currentPath, item.path)}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
