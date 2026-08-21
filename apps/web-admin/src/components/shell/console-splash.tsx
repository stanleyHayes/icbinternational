/**
 * The screen the console shows while it is getting ready.
 *
 * The client app's `FullPageLoader` with the console's own mark and vocabulary. Quiet by design:
 * a wordmark and a spinner, no progress bar, because a bar that cannot know how far along it is
 * teaches operators to distrust progress bars.
 */

import { Spinner } from '@reliance/ui';

import { RelianceMark } from './reliance-mark';

/**
 * A centred, accessible waiting state that fills the viewport.
 *
 * @param label announced to screen readers; name what is being waited for, never "loading".
 */
export function ConsoleSplash({ label = 'Opening the console' }: { readonly label?: string }) {
  return (
    <div
      className="bg-canvas flex min-h-dvh flex-col items-center justify-center gap-6 px-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <RelianceMark size={32} />
        <span className="font-display text-fg text-lg font-semibold tracking-tight">
          Reliance Console
        </span>
      </div>
      <div className="text-fg-muted flex items-center gap-3">
        <Spinner className="size-4" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
