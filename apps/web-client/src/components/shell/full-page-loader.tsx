'use client';

/**
 * The screen shown while the app is getting ready.
 *
 * Deliberately quiet: a wordmark and a spinner, no progress bar. A progress bar that cannot know
 * how far along it is teaches customers to distrust progress bars.
 */

import { Spinner } from '@reliance/ui';

import { BrandMark } from './brand-mark';

/**
 * A centred, accessible waiting state that fills the viewport.
 *
 * @param label announced to screen readers; say what is being waited for, not "loading".
 */
export function FullPageLoader({ label = 'Preparing your accounts' }: { readonly label?: string }) {
  return (
    <div
      className="bg-canvas flex min-h-dvh flex-col items-center justify-center gap-6 px-6"
      role="status"
      aria-live="polite"
    >
      <BrandMark className="h-9" />
      <div className="text-fg-muted flex items-center gap-3">
        <Spinner className="size-4" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
