'use client';

/**
 * One saved payee in the list.
 *
 * The row is a link to the payee, with the favourite toggle as a separate control inside it rather
 * than as part of the link — a star that navigates is a star nobody can press. Both are keyboard
 * reachable and both say what they do.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import Link from 'next/link';

import type { Beneficiary } from '@reliance/contracts';
import { cn } from '@reliance/ui';

import { describeDestination, laneRoutes, movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { relativeTime } from '@/lib/format';

import { CoolingOffBadge } from './cooling-off';

/** Props for {@link PayeeRow}. */
export interface PayeeRowProps {
  readonly payee: Beneficiary;
}

/** Toggles the favourite flag and refreshes every list that shows it. */
function useFavouriteToggle(payee: Beneficiary) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await browserApi().beneficiaries.update(payee.id, { isFavourite: !payee.isFavourite });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.beneficiaries.all });
    },
  });
}

/** The star. A real button, with its state in its accessible name. */
function FavouriteToggle({ payee }: PayeeRowProps) {
  const toggle = useFavouriteToggle(payee);
  const label = payee.isFavourite
    ? `Remove ${payee.nickname} from favourites`
    : `Add ${payee.nickname} to favourites`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={payee.isFavourite}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate()}
      className={cn(
        'hover:bg-surface-sunken rounded-sm p-1.5',
        'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        payee.isFavourite ? 'text-pending' : 'text-fg-subtle',
      )}
    >
      <Star aria-hidden="true" className="size-4" />
    </button>
  );
}

/**
 * @example <PayeeRow payee={payee} />
 */
export function PayeeRow({ payee }: PayeeRowProps) {
  return (
    <li className="border-border flex items-center gap-2 border-b last:border-0">
      <Link
        href={laneRoutes.payees.detail(payee.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-3 py-3',
          'hover:bg-surface-sunken focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">{payee.nickname}</span>
          <span className="text-fg-muted mt-0.5 block truncate text-xs">
            {describeDestination(payee.destination)} · {payee.currency}
            {payee.lastUsedAt ? ` · paid ${relativeTime(payee.lastUsedAt)}` : ' · not paid yet'}
          </span>
        </span>
        <CoolingOffBadge payee={payee} />
      </Link>
      <FavouriteToggle payee={payee} />
    </li>
  );
}
