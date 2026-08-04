/**
 * The Card, and its header / body / footer slots.
 *
 * Cards are compound rather than prop-driven (`title`, `subtitle`, `action`, `footer`…) because
 * the prop-driven version acquires a new prop every sprint and still cannot express the layout
 * the next screen needs. Composition costs three extra lines at the call site and never blocks.
 */

import { type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export type CardElevation = 'flat' | 'raised';

const ELEVATION: Readonly<Record<CardElevation, string>> = {
  flat: 'border border-border',
  raised: 'border border-border shadow-card',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly elevation?: CardElevation;
  /** Removes internal padding so the card can hold a table or a full-bleed image. */
  readonly flush?: boolean;
}

/**
 * @example
 * <Card>
 *   <CardHeader title="Everyday account" action={<Button variant="ghost">Manage</Button>} />
 *   <CardBody>…</CardBody>
 * </Card>
 */
export function Card({
  elevation = 'flat',
  flush = false,
  className,
  ...props
}: Readonly<CardProps>) {
  return (
    <div
      className={cn(
        'bg-surface text-fg rounded-lg',
        ELEVATION[elevation],
        flush ? 'overflow-hidden' : 'p-5',
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  /** Trailing control — a menu, a link, a switch. */
  readonly action?: ReactNode;
}

/** Title, optional description, and a trailing action aligned to the first line. */
export function CardHeader({
  title,
  description,
  action,
  className,
  children,
  ...props
}: Readonly<CardHeaderProps>) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">
        {title && <h3 className="font-display text-fg truncate text-lg font-semibold">{title}</h3>}
        {description && <p className="text-fg-muted text-sm">{description}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** The card's main content. Adds top spacing when it follows a header. */
export function CardBody({ className, ...props }: Readonly<HTMLAttributes<HTMLDivElement>>) {
  return <div className={cn('mt-4 first:mt-0', className)} {...props} />;
}

/** Actions and metadata, separated by a rule. */
export function CardFooter({ className, ...props }: Readonly<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cn('border-border mt-5 flex items-center gap-3 border-t pt-4', className)}
      {...props}
    />
  );
}
