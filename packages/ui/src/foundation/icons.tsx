/**
 * The internal icon set.
 *
 * Deliberately tiny and deliberately not a dependency. These are the glyphs the design system
 * needs to function — a select needs a chevron, a dialog needs a close, a sortable column needs
 * an arrow — and shipping an icon library to draw nine shapes would put a few hundred kilobytes
 * of unused paths in every bundle. Product icons come from the app, not from here.
 *
 * Every icon is decorative: it is `aria-hidden` and inherits `currentColor`, so the accessible
 * name always comes from the control that contains it, never from the glyph.
 */

import { type ReactNode, type SVGProps } from 'react';

import { cn } from '../lib/cn.js';

/** Props accepted by every icon. Size comes from `className` (`size-4`), colour from the parent. */
export type IconProps = Readonly<Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>>;

const STROKE_WIDTH = '1.75';

/**
 * Shared chrome for stroke icons. Centralising `viewBox` and stroke settings is what keeps the
 * optical weight of a chevron and a checkmark the same at 16px.
 */
function StrokeIcon({ className, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('size-4 shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Disclosure chevron — selects, accordions, expandable rows. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </StrokeIcon>
  );
}

/** Previous — pagination, carousels, back navigation. */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m15 18-6-6 6-6" />
    </StrokeIcon>
  );
}

/** Next — pagination, carousels, forward navigation. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </StrokeIcon>
  );
}

/** Affirmative mark — checkbox, completed stepper node, success alert. */
export function CheckIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </StrokeIcon>
  );
}

/** Dismiss — dialogs, drawers, toasts, removable chips. */
export function CloseIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </StrokeIcon>
  );
}

/** Indeterminate checkbox, and the "no change" state of a delta. */
export function MinusIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M5 12h14" />
    </StrokeIcon>
  );
}

/** Ascending sort, and upward rate movement. */
export function ArrowUpIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </StrokeIcon>
  );
}

/** Descending sort, and downward rate movement. */
export function ArrowDownIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </StrokeIcon>
  );
}

/** Unsorted column header — both directions available. */
export function SortIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m8 9 4-4 4 4M16 15l-4 4-4-4" />
    </StrokeIcon>
  );
}

/** Warning and error states. */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </StrokeIcon>
  );
}

/** Informational states, and the "why am I seeing this" affordance next to a figure. */
export function InfoIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </StrokeIcon>
  );
}
