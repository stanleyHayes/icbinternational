/**
 * The handful of class strings that must be identical everywhere.
 *
 * A focus ring that differs by two pixels between the Button and the Select is not a style bug,
 * it is a signal to a keyboard user that they have left one system and entered another. Same for
 * motion: one duration for state changes, one for surfaces appearing. These live here so there is
 * exactly one place to change them and no way for a component to quietly invent its own.
 */

/**
 * `:focus-visible` rather than `:focus` — a mouse user clicking a button should not be shown the
 * keyboard affordance, but a keyboard user must never lose it.
 */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

/** Focus ring for controls that sit flush inside another surface (table rows, list items). */
export const FOCUS_RING_INSET =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset';

/** State changes: hover, press, colour. Fast enough to feel instant, slow enough to be seen. */
export const TRANSITION_STATE =
  'transition-[color,background-color,border-color,box-shadow,opacity] ' +
  'duration-(--rb-duration-fast) ease-standard';

/** Disabled controls stay legible — greying a control out until it is unreadable is not a state. */
export const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Fixed-width digits. Applied to every figure that can change in place: a balance polling for
 * updates, a countdown, an OTP box. Without it the row reflows on each digit and the eye reads
 * movement where there is only a number.
 */
export const TABULAR = 'rb-tabular';

/** Visually hidden but present for screen readers and still focusable. */
export const SR_ONLY = 'sr-only';

/** The shared shape of a text-entry control, so Input, Select and Textarea cannot drift. */
export const FIELD_BASE =
  'w-full rounded-md border border-border bg-surface px-3 text-fg placeholder:text-fg-subtle ' +
  'aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger';
