'use client';

/**
 * The "how to take this photo" list.
 *
 * Three lines, before the customer takes the photo rather than after it is rejected. Almost every
 * failed identity check is one of these three things, and each one costs the customer a day.
 */

/** A short list of bullets under a capture control. */
export function CaptureGuidance({ points }: { readonly points: readonly string[] }) {
  return (
    <ul className="text-fg-muted list-disc space-y-1 pl-5 text-sm">
      {points.map((point) => (
        <li key={point}>{point}</li>
      ))}
    </ul>
  );
}
