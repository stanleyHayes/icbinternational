import type { ReactNode } from 'react';

import { BrandLockup } from '@/components/shell';

/**
 * The frame around account opening.
 *
 * No navigation. Somebody halfway through proving who they are should not be one mis-tap from the
 * dashboard they cannot use yet, and a sidebar full of products they have not been given is a list
 * of things that will not work.
 *
 * The only way out is the sign-out control on the wizard itself, which is deliberate: leaving is a
 * decision, not a slip.
 */
export default function OnboardingLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="bg-canvas flex min-h-dvh flex-col">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-5 sm:px-8">
          <BrandLockup className="text-fg h-8 w-auto" title="Reliance Bank" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-8 sm:py-12">{children}</main>

      <footer className="text-fg-subtle mx-auto w-full max-w-3xl px-5 pb-10 text-xs sm:px-8">
        We are required by law to verify the identity of everyone we open an account for. Your
        documents are encrypted, visible only to the team that reviews them, and deleted once we no
        longer need to keep them.
      </footer>
    </div>
  );
}
