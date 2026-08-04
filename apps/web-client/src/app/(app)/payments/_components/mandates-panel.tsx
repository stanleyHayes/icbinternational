'use client';

/**
 * Direct debits.
 *
 * The list a customer opens when they suspect they are paying for something they cancelled. So the
 * merchant, the last amount collected and the next expected date are all on the row — those three
 * facts answer the question without opening anything.
 *
 * Pausing is reversible and offered directly. Cancelling is final — the merchant has to ask again —
 * and says so before it happens.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { MandateStatus, type Mandate } from '@reliance/contracts';
import { Button, StatusPill } from '@reliance/ui';

import { EmptyPanel, FormAlert } from '@/components/shell';
import {
  ConfirmAction,
  MANDATE_STATUS,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

const CANCEL_CONSEQUENCE =
  'The merchant will not be able to collect anything else. If you still want the service, you will have to set the direct debit up again with them, not with us.';

const NO_MANDATES = (
  <EmptyPanel
    title="No direct debits"
    description="Direct debits you have authorised will appear here, with what was last collected and what is expected next."
  />
);

/** Pause, resume and cancel, sharing one invalidation. */
function useMandateChange() {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      readonly id: string;
      readonly status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
    }) => {
      await browserApi().payments.updateMandate(id, { status });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.payments.all });
    },
  });
}

/** What was last taken and what is expected next. */
function MandateFacts({ mandate }: { readonly mandate: Mandate }) {
  return (
    <span className="text-fg-muted mt-0.5 block text-xs">
      {mandate.lastAmount ? (
        <>
          Last took{' '}
          <MoneyCell money={mandate.lastAmount} size="sm" muted srLabel="Last collected" />
        </>
      ) : (
        'Nothing collected yet'
      )}
      {mandate.nextExpectedAt ? ` · next around ${formatDate(mandate.nextExpectedAt)}` : ''}
    </span>
  );
}

function MandateRow({
  mandate,
  onPause,
  onCancel,
}: {
  readonly mandate: Mandate;
  readonly onPause: (mandate: Mandate) => void;
  readonly onCancel: (mandate: Mandate) => void;
}) {
  const status = MANDATE_STATUS[mandate.status];
  const live = mandate.status === MandateStatus.ACTIVE || mandate.status === MandateStatus.PAUSED;

  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <span className="min-w-0">
        <span className="text-fg block truncate text-sm font-medium">{mandate.merchantName}</span>
        <MandateFacts mandate={mandate} />
      </span>

      <span className="flex shrink-0 items-center gap-2">
        <StatusPill tone={status.tone} label={status.label} />
        {live ? (
          <Button variant="secondary" size="sm" onClick={() => onPause(mandate)}>
            {mandate.status === MandateStatus.PAUSED ? 'Resume' : 'Pause'}
          </Button>
        ) : null}
        {live ? (
          <Button variant="ghost" size="sm" onClick={() => onCancel(mandate)}>
            Cancel
          </Button>
        ) : null}
      </span>
    </li>
  );
}

/**
 * @example <MandatesPanel />
 */
export function MandatesPanel() {
  const filters = {};
  const [cancelling, setCancelling] = useState<Mandate | null>(null);
  const change = useMandateChange();

  const mandates = useQuery({
    queryKey: movementKeys.payments.mandates(filters),
    queryFn: async () => (await browserApi().payments.listMandates()).data,
  });

  const togglePause = (mandate: Mandate): void => {
    change.mutate({
      id: mandate.id,
      status: mandate.status === MandateStatus.PAUSED ? 'ACTIVE' : 'PAUSED',
    });
  };

  return (
    <Section
      title="Direct debits"
      description="Everything a company can collect from you automatically."
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={change.error} />

        <MandateList query={mandates} onPause={togglePause} onCancel={setCancelling} />

        <ConfirmAction
          open={cancelling !== null}
          onClose={() => setCancelling(null)}
          title={`Cancel the direct debit to ${cancelling?.merchantName ?? 'this merchant'}`}
          consequence={CANCEL_CONSEQUENCE}
          confirmLabel="Cancel direct debit"
          destructive
          onConfirm={async () => {
            if (cancelling) await change.mutateAsync({ id: cancelling.id, status: 'CANCELLED' });
          }}
        />
      </div>
    </Section>
  );
}

/** The mandates themselves, or an explanation of what would be here. */
function MandateList({
  query,
  onPause,
  onCancel,
}: {
  readonly query: UseQueryResult<Mandate[]>;
  readonly onPause: (mandate: Mandate) => void;
  readonly onCancel: (mandate: Mandate) => void;
}) {
  return (
    <QueryPanel
      query={query}
      skeletonRows={3}
      isEmpty={(list) => list.length === 0}
      empty={NO_MANDATES}
    >
      {(list) => (
        <ul className="flex flex-col">
          {list.map((mandate) => (
            <MandateRow key={mandate.id} mandate={mandate} onPause={onPause} onCancel={onCancel} />
          ))}
        </ul>
      )}
    </QueryPanel>
  );
}
