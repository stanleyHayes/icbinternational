'use client';

/**
 * Paying somebody the customer has paid before.
 *
 * Saved payees come first because that is what most payments are, and because a payee whose
 * details were confirmed once is safer than a set of digits typed again from a message.
 *
 * A payee still inside its cooling-off window is offered, but labelled. The bank holds new payees
 * back from large payments for a day, and discovering that at the review screen is worse than
 * being told here.
 */

import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import Link from 'next/link';

import type { Beneficiary } from '@reliance/contracts';
import { Badge, cn } from '@reliance/ui';

import { describeDestination, laneRoutes, movementKeys, QueryPanel } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { nowMs } from '@/lib/clock';
import { relativeTime } from '@/lib/format';

const PICKER_LIMIT = 8;

/** True while the bank is still holding this payee back from large payments. */
export function inCoolingOff(payee: Beneficiary): boolean {
  return payee.trustedFrom !== null && new Date(payee.trustedFrom).getTime() > nowMs();
}

/** The payee's name, its details and when it was last used. */
function PayeeSummary({ payee }: { readonly payee: Beneficiary }) {
  return (
    <span className="min-w-0">
      <span className="text-fg flex items-center gap-1.5 text-sm font-medium">
        {payee.isFavourite ? (
          <Star aria-label="Favourite" className="text-pending size-3.5" />
        ) : null}
        <span className="truncate">{payee.nickname}</span>
      </span>
      <span className="text-fg-muted mt-0.5 block truncate text-xs">
        {describeDestination(payee.destination)}
        {payee.lastUsedAt ? ` · paid ${relativeTime(payee.lastUsedAt)}` : ' · not paid yet'}
      </span>
    </span>
  );
}

function PayeeRow({
  payee,
  selected,
  onPick,
}: {
  readonly payee: Beneficiary;
  readonly selected: boolean;
  readonly onPick: (payee: Beneficiary) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onPick(payee)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
          selected ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-sunken',
        )}
      >
        <PayeeSummary payee={payee} />
        {inCoolingOff(payee) ? (
          <Badge tone="pending" className="shrink-0">
            New payee
          </Badge>
        ) : null}
      </button>
    </li>
  );
}

/** What the picker says when the customer has never saved anybody. */
function NoSavedPayees() {
  return (
    <p className="border-border text-fg-muted rounded-md border border-dashed px-4 py-6 text-sm">
      You have not saved anyone yet. Enter their details below and we will offer to save them once
      the payment goes through.
    </p>
  );
}

/** Props for {@link PayeePicker}. */
export interface PayeePickerProps {
  readonly onPick: (payee: Beneficiary) => void;
  /** The payee currently filling the form, so its row can show as chosen. */
  readonly selectedId: string;
}

/**
 * @example <PayeePicker selectedId={draft.payeeId} onPick={fillFromPayee} />
 */
export function PayeePicker({ onPick, selectedId }: PayeePickerProps) {
  const filters = { limit: PICKER_LIMIT };
  const payees = useQuery({
    queryKey: movementKeys.beneficiaries.list(filters),
    queryFn: async () => (await browserApi().beneficiaries.list(filters)).data,
  });

  return (
    <QueryPanel
      query={payees}
      skeletonRows={2}
      isEmpty={(list) => list.length === 0}
      empty={<NoSavedPayees />}
    >
      {(list) => (
        <ul className="flex flex-col gap-2">
          {list.map((payee) => (
            <PayeeRow
              key={payee.id}
              payee={payee}
              selected={payee.id === selectedId}
              onPick={onPick}
            />
          ))}
          {list.length === PICKER_LIMIT ? (
            <li className="text-fg-muted pt-1 text-sm">
              Showing your most recent payees.{' '}
              <Link
                href={laneRoutes.payees.index}
                className="text-accent font-medium hover:underline"
              >
                See everyone you have saved
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </QueryPanel>
  );
}
