'use client';

/**
 * One saved payee.
 *
 * What the bank holds, what the receiving bank said about the name when it was checked, and the
 * two things a customer comes here to do: pay them, or stop holding their details. Deleting a
 * payee is step-up gated — an attacker with a live session should not be able to quietly swap the
 * account behind a name somebody trusts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { Beneficiary } from '@reliance/contracts';
import { Button, StatusPill } from '@reliance/ui';

import { FormAlert, LinkButton } from '@/components/shell';
import {
  ConfirmAction,
  DetailList,
  laneRoutes,
  movementKeys,
  QueryPanel,
  Section,
  stepUpOptions,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { CoolingOffNotice } from './cooling-off';
import { payeeRows } from './payee-rows';

const DELETE_CONSEQUENCE =
  'We will stop holding their details. Payments you have already sent are unaffected, and you can save them again at any time.';

/** Props for {@link PayeeDetail}. */
export interface PayeeDetailProps {
  readonly payeeId: string;
}

/** Removes the payee and sends the customer back to the list. */
function useRemovePayee(payeeId: string) {
  const cache = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async ({ stepUpToken }: { readonly stepUpToken?: string }) => {
      await browserApi().beneficiaries.remove(payeeId, stepUpOptions(stepUpToken));
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.beneficiaries.all });
      router.push(laneRoutes.payees.index);
    },
  });
}

function DetailBody({ payee }: { readonly payee: Beneficiary }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useRemovePayee(payee.id);

  return (
    <div className="flex flex-col gap-6">
      <CoolingOffNotice payee={payee} />

      <Section
        title={payee.nickname}
        description={`Saved on ${formatDate(payee.createdAt)}`}
        action={payee.isFavourite ? <StatusPill tone="pending" label="Favourite" /> : null}
      >
        <DetailList items={payeeRows(payee)} />
        <FormAlert error={remove.error} />

        <div className="border-border mt-5 flex flex-wrap gap-3 border-t pt-4">
          <LinkButton href={laneRoutes.transfers.toPayee(payee.id)}>Pay this payee</LinkButton>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Remove this payee
          </Button>
        </div>
      </Section>

      <ConfirmAction
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${payee.nickname}`}
        consequence={DELETE_CONSEQUENCE}
        confirmLabel="Remove payee"
        destructive
        stepUpReason="remove a saved payee"
        onConfirm={(options) => remove.mutateAsync(options)}
      />
    </div>
  );
}

/**
 * @example <PayeeDetail payeeId={payeeId} />
 */
export function PayeeDetail({ payeeId }: PayeeDetailProps) {
  const payee = useQuery({
    queryKey: movementKeys.beneficiaries.detail(payeeId),
    queryFn: async () => (await browserApi().beneficiaries.get(payeeId)).data,
  });

  return (
    <QueryPanel query={payee} skeletonRows={3}>
      {(data) => <DetailBody payee={data} />}
    </QueryPanel>
  );
}
