import Link from 'next/link';
import type { ReactNode } from 'react';

import { BrandLockup } from '@/components/shell';

const REASSURANCE: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Your money is protected',
    body: 'Eligible deposits are covered up to £85,000 per person by the Financial Services Compensation Scheme.',
  },
  {
    title: 'You are told about every payment',
    body: 'Instant alerts when money leaves your account, and a card you can freeze the moment something looks wrong.',
  },
  {
    title: 'Someone answers',
    body: 'UK-based support, seven days a week, 7am to 11pm — on 0800 460 0460 or in the app.',
  },
];

/**
 * The frame around signing in, registering and recovering an account.
 *
 * Two columns on a wide screen: the reassurance panel on the left, the task on the right. On a
 * phone the panel is dropped rather than stacked above the form — somebody who has come here to
 * sign in should not have to scroll past marketing to find the password field.
 *
 * The panel is `aria-hidden` for the same reason: it repeats what the marketing site says, and a
 * screen-reader user landing on the sign-in page should hear the form.
 */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <aside
        aria-hidden="true"
        className="bg-navy-900 hidden flex-col justify-between px-12 py-10 text-slate-50 lg:flex"
      >
        <BrandLockup className="h-10 w-auto text-slate-50" title={null} />

        <div className="max-w-md">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-balance">
            Everyday banking, without the guesswork.
          </h2>
          <dl className="mt-10 space-y-6">
            {REASSURANCE.map((point) => (
              <div key={point.title}>
                <dt className="text-base font-medium text-slate-50">{point.title}</dt>
                <dd className="mt-1 text-sm text-pretty text-slate-300">{point.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-slate-400">
          Reliance Bank plc. Registered in England and Wales, company number 04182617. Registered
          office: 1 Ludgate Square, London EC4M 7AS.
        </p>
      </aside>

      <main className="bg-canvas flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="focus-visible:ring-focus mb-8 inline-block rounded-md focus-visible:ring-2 focus-visible:outline-none lg:hidden"
          >
            <BrandLockup className="text-fg h-9 w-auto" title="Reliance Bank" />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
