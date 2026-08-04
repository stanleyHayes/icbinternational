/**
 * The record inspector.
 *
 * A queue is a list of things to decide about, and deciding needs detail the list has no
 * room for. A drawer keeps the queue visible behind it, so an operator can see where they
 * are in the work while they read one item — which a full-page detail view destroys, and
 * which is why they lose their place and re-read rows they have already cleared.
 *
 * Detail is a description list, not a grid of divs: a screen reader then reads
 * "Raised by, Amara Boateng" as a pair rather than as two unrelated fragments.
 */

'use client';

import type { ReactNode } from 'react';

import { cn, Drawer } from '@reliance/ui';

import { shortenId } from '@/lib/format';

export interface DetailDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  /** One line of context — the customer, the rule, the counterparty. */
  readonly subtitle?: ReactNode;
  /** The record's public id, shown so an operator can quote it in a note or a ticket. */
  readonly recordId?: string;
  /** Sticky footer, usually a `DecisionPanel` or the record's primary action. */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/** A right-hand panel holding one record. */
export function DetailDrawer(props: DetailDrawerProps) {
  const { open, onClose, title, subtitle, recordId, footer, children } = props;

  return (
    <Drawer open={open} onClose={onClose} title={title} side="right" footer={footer}>
      {(subtitle ?? recordId) && (
        <div className="font-body text-fg-muted mb-4 flex flex-wrap items-center gap-2 text-sm">
          {subtitle}
          {recordId && (
            <span className="font-mono text-xs" title={recordId}>
              {shortenId(recordId)}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-5">{children}</div>
    </Drawer>
  );
}

export interface DetailSectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** A labelled group of fields inside a {@link DetailDrawer}. */
export function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
        {title}
      </h3>
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5">{children}</dl>
    </section>
  );
}

export interface DetailFieldProps {
  readonly label: string;
  /** Renders in a monospaced face — for ids, references and IBANs. */
  readonly mono?: boolean;
  readonly children: ReactNode;
}

/** One label-and-value pair. Must be used inside a {@link DetailSection}. */
export function DetailField({ label, mono, children }: DetailFieldProps) {
  return (
    <>
      <dt className="font-body text-fg-muted text-sm">{label}</dt>
      <dd className={cn('font-body text-fg text-sm', mono && 'font-mono text-xs')}>{children}</dd>
    </>
  );
}
