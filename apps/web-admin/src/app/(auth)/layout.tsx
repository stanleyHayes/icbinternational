/**
 * The layout for authentication.
 *
 * Sober rather than welcoming. A marketing hero on a staff sign-in page is a place for a
 * convincing copy of it to hide, so this screen carries the mark, the institution's name,
 * and nothing an attacker could use to make a lookalike feel more legitimate.
 */

import type { ReactNode } from 'react';

import { RelianceMark } from '@/components/shell/reliance-mark';
import { BANK_NAME } from '@/lib/env';

/** Centres the sign-in card on a plain canvas. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-canvas flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <RelianceMark size={36} />
        <span className="flex flex-col leading-tight">
          <span className="font-display text-lg font-semibold">{BANK_NAME}</span>
          <span className="font-body text-fg-muted text-sm">Operations console</span>
        </span>
      </div>

      <main className="border-border bg-surface shadow-card w-full max-w-sm rounded-lg border p-6">
        {children}
      </main>

      <p className="font-body text-fg-subtle max-w-sm text-center text-xs">
        Access is limited to authorised staff on approved networks. Every action in this console is
        recorded against the account that performs it.
      </p>
    </div>
  );
}
