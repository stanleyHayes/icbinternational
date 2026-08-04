'use client';

/**
 * Skip, pause and cancel — three different promises.
 *
 * The API keeps them separate for the reason a customer would: skipping drops the next payment and
 * leaves the schedule running, pausing stops it until it is resumed, and cancelling ends it. A
 * single "status" control that collapses the three would make "just skip this month" and "stop
 * paying my rent" the same gesture.
 *
 * Cancelling is confirm-gated and states what stops. The other two are reversible and are not.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { TransferOrderStatus, type TransferOrder } from '@reliance/contracts';
import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { ConfirmAction, movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

/** Props for {@link OrderActions}. */
export interface OrderActionsProps {
  readonly order: TransferOrder;
  /** Called once the order has been cancelled and the screen should move on. */
  readonly onCancelled: () => void;
}

/** Every change this screen can make to a standing order, sharing one invalidation. */
function useOrderMutations(order: TransferOrder, onCancelled: () => void) {
  const cache = useQueryClient();
  const refresh = async (): Promise<void> => {
    await cache.invalidateQueries({ queryKey: movementKeys.transferOrders.all });
  };

  const skip = useMutation({
    mutationFn: async () => {
      await browserApi().transferOrders.skipNext(order.id);
    },
    onSuccess: refresh,
  });

  const setPaused = useMutation({
    mutationFn: async (paused: boolean) => {
      await browserApi().transferOrders.setPaused(order.id, { paused });
    },
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      await browserApi().transferOrders.cancel(order.id);
    },
    onSuccess: async () => {
      await refresh();
      onCancelled();
    },
  });

  return { skip, setPaused, cancel };
}

/** The cancellation copy, naming what stops and what does not. */
function cancelConsequence(order: TransferOrder): string {
  return `No further payments of ${order.name} will be taken. Payments already sent are unaffected, and you can set the same standing order up again whenever you like.`;
}

/** Props for {@link ScheduleControls}. */
interface ScheduleControlsProps {
  readonly order: TransferOrder;
  readonly paused: boolean;
  readonly live: boolean;
  readonly skipping: boolean;
  readonly pausing: boolean;
  readonly onSkip: () => void;
  readonly onTogglePause: () => void;
  readonly onStop: () => void;
}

/** Skip, pause and stop, offered only where each of them means something. */
function ScheduleControls(props: ScheduleControlsProps) {
  const { order, paused, live } = props;

  return (
    <div className="flex flex-wrap gap-3">
      {order.nextRunAt && !paused ? (
        <Button variant="secondary" loading={props.skipping} onClick={props.onSkip}>
          Skip the payment on {formatDate(order.nextRunAt)}
        </Button>
      ) : null}

      {live ? (
        <Button variant="secondary" loading={props.pausing} onClick={props.onTogglePause}>
          {paused ? 'Resume this standing order' : 'Pause this standing order'}
        </Button>
      ) : null}

      {live ? (
        <Button variant="danger" onClick={props.onStop}>
          Stop this standing order
        </Button>
      ) : null}
    </div>
  );
}

/**
 * @example <OrderActions order={order} onCancelled={goBack} />
 */
export function OrderActions({ order, onCancelled }: OrderActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const { skip, setPaused, cancel } = useOrderMutations(order, onCancelled);
  const paused = order.status === TransferOrderStatus.PAUSED;

  return (
    <div className="flex flex-col gap-3">
      <FormAlert error={skip.error ?? setPaused.error ?? cancel.error} />

      <ScheduleControls
        order={order}
        paused={paused}
        live={order.status === TransferOrderStatus.ACTIVE || paused}
        skipping={skip.isPending}
        pausing={setPaused.isPending}
        onSkip={() => skip.mutate()}
        onTogglePause={() => setPaused.mutate(!paused)}
        onStop={() => setConfirming(true)}
      />

      <ConfirmAction
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Stop ${order.name}`}
        consequence={cancelConsequence(order)}
        confirmLabel="Stop standing order"
        destructive
        onConfirm={() => cancel.mutateAsync()}
      />
    </div>
  );
}
