'use client';

/**
 * Language, and how the application looks.
 *
 * The theme control is the shell's own, so the choice made here is the choice the top bar shows.
 * Two places to set one preference that disagree with each other is worse than one place.
 */

import { ThemeToggle } from '@/components/shell';
import { Section } from '@/components/transfers';

/**
 * @example <PreferencesPanel />
 */
export function PreferencesPanel() {
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Appearance"
        description="Follow your device, or pick light or dark yourself. We respect reduced motion either way."
      >
        <ThemeToggle />
      </Section>

      <Section title="Language" description="The language we use across the app and in emails.">
        <p className="text-fg-muted text-sm">
          Reliance Bank is currently available in British English. We are adding more languages, and
          we will tell you here as soon as yours is one of them.
        </p>
      </Section>
    </div>
  );
}
