'use client';

/**
 * The first thing in the tab order.
 *
 * Without it, every keyboard visit to every page starts by tabbing through nine navigation links
 * to reach the content. It is hidden until focused, which is the one case where hiding a control
 * is the accessible choice.
 */

/** The id the skip link targets. The application's `<main>` must carry it. */
export const MAIN_CONTENT_ID = 'main-content';

/** Renders as the first child of the app shell. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="rb-skip-link bg-accent text-accent-fg rounded-md px-4 py-2 text-sm font-medium shadow-lg"
    >
      Skip to main content
    </a>
  );
}
