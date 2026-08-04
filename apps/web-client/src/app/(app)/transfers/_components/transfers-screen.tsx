'use client';

/**
 * The Transfers screen: the flow, with recent payments beside it.
 *
 * Two columns on a wide viewport and one on a narrow one, with the flow first in the DOM either
 * way — the reason somebody opened this page is to send money, and that has to be the first thing
 * a keyboard or screen reader reaches.
 *
 * When the customer arrived from "pay them again" the payee is fetched before the flow mounts, so
 * the form starts filled rather than filling itself a moment later under the customer's cursor. A
 * payee that cannot be loaded is not an error worth a screen: the flow simply opens empty.
 */

import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@reliance/ui';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { RecentTransfers } from './recent-transfers';
import { TransferFlowScreen } from './transfer-flow';

/** Props for {@link TransfersScreen}. */
export interface TransfersScreenProps {
  /** A saved payee to start from, taken from `?payee=`. */
  readonly payeeId: string | null;
}

function SeededFlow({ payeeId }: { readonly payeeId: string }) {
  const payee = useQuery({
    queryKey: movementKeys.beneficiaries.detail(payeeId),
    queryFn: async () => (await browserApi().beneficiaries.get(payeeId)).data,
    retry: false,
  });

  if (payee.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Opening this payment">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <TransferFlowScreen initialPayee={payee.data} />;
}

/**
 * @example <TransfersScreen payeeId={payeeId} />
 */
export function TransfersScreen({ payeeId }: TransfersScreenProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      {payeeId ? <SeededFlow payeeId={payeeId} /> : <TransferFlowScreen />}
      <RecentTransfers />
    </div>
  );
}
