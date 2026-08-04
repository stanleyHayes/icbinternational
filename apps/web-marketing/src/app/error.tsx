'use client';

import { useEffect } from 'react';

import { Button } from '@reliance/ui';

import { BANK } from '@/content/site';

/**
 * The page-level error boundary.
 *
 * It says two things a customer in this situation needs: that their money is unaffected,
 * and how to reach a person. It says nothing about what actually failed — a stack trace or
 * an error code helps nobody outside this building, and a digest that looks like a
 * reference number invites people to quote it at a call handler who cannot use it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console and picked up by the platform's error reporting.
    console.error(error);
  }, [error]);

  return (
    <div className="rb-shell py-24 md:py-32">
      <p className="text-danger text-xs font-semibold tracking-widest uppercase">
        Something went wrong
      </p>
      <h1 className="font-display text-fg mt-3 max-w-2xl text-4xl font-semibold md:text-5xl">
        This page did not load
      </h1>
      <p className="text-fg-muted mt-5 max-w-xl text-lg leading-relaxed">
        The problem is at our end, not yours, and nothing about your account or your money is
        affected. Trying again usually works.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
        <a
          href={`tel:${BANK.phone}`}
          className="border-border-strong bg-surface text-fg hover:bg-surface-sunken inline-flex h-12 items-center rounded-md border px-6 text-lg font-medium"
        >
          Call {BANK.phoneDisplay}
        </a>
      </div>
    </div>
  );
}
