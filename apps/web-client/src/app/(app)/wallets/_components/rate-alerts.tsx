'use client';

/**
 * Telling the customer when a rate moves their way.
 *
 * An alert is the honest alternative to checking the board every morning. Each one names the pair,
 * the direction and the target, so a list of five is still readable — "GBP to EUR above 1.2000",
 * not "Alert 3".
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { CreateFxAlertRequest, FxAlert } from '@reliance/contracts';
import { Button, FormField, Input, Select } from '@reliance/ui';

import { EmptyPanel, FormAlert } from '@/components/shell';
import { movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const CURRENCIES = ['GBP', 'EUR', 'USD', 'CHF', 'JPY'] as const;

const NO_ALERTS = (
  <EmptyPanel
    title="No rate alerts"
    description="Set one and we will tell you the moment a pair reaches the rate you are waiting for, so you do not have to watch the board."
  />
);

/** How one alert reads. */
function describe(alert: FxAlert): string {
  const direction = alert.direction === 'ABOVE' ? 'goes above' : 'drops below';
  return `${alert.from} to ${alert.to} ${direction} ${alert.targetRate}`;
}

/** Every change this panel makes, sharing one invalidation. */
function useAlertMutations() {
  const cache = useQueryClient();
  const refresh = async (): Promise<void> => {
    await cache.invalidateQueries({ queryKey: movementKeys.fx.alerts() });
  };

  const create = useMutation({
    mutationFn: async (body: CreateFxAlertRequest) =>
      (await browserApi().fx.createAlert(body)).data,
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await browserApi().fx.deleteAlert(id);
    },
    onSuccess: refresh,
  });

  return { create, remove };
}

function AlertRow({
  alert,
  onRemove,
}: {
  readonly alert: FxAlert;
  readonly onRemove: (id: string) => void;
}) {
  return (
    <li className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0">
      <span className="text-fg text-sm">Tell me when {describe(alert)}</span>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={`Remove the alert for when ${describe(alert)}`}
        onClick={() => onRemove(alert.id)}
        startIcon={<Trash2 aria-hidden="true" className="size-4" />}
      />
    </li>
  );
}

/**
 * @example <RateAlerts />
 */
export function RateAlerts() {
  const [from, setFrom] = useState<string>('GBP');
  const [to, setTo] = useState<string>('EUR');
  const [direction, setDirection] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [targetRate, setTargetRate] = useState('');
  const { create, remove } = useAlertMutations();

  const alerts = useQuery({
    queryKey: movementKeys.fx.alerts(),
    queryFn: async () => (await browserApi().fx.listAlerts()).data,
  });

  const add = (): void => {
    if (!targetRate) return;
    create.mutate({ from, to, direction, targetRate } as CreateFxAlertRequest);
  };

  return (
    <Section title="Rate alerts" description="We will tell you when a rate reaches your target.">
      <div className="flex flex-col gap-5">
        <FormAlert error={create.error ?? remove.error} />

        <AlertList query={alerts} onRemove={remove.mutate} />

        <AlertFields
          from={from}
          to={to}
          direction={direction}
          targetRate={targetRate}
          onFrom={setFrom}
          onTo={setTo}
          onDirection={setDirection}
          onTargetRate={setTargetRate}
        />

        <div className="flex justify-end">
          <Button disabled={!targetRate} loading={create.isPending} onClick={add}>
            Set this alert
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Props for {@link AlertFields}. */
interface AlertFieldsProps {
  readonly from: string;
  readonly to: string;
  readonly direction: 'ABOVE' | 'BELOW';
  readonly targetRate: string;
  readonly onFrom: (value: string) => void;
  readonly onTo: (value: string) => void;
  readonly onDirection: (value: 'ABOVE' | 'BELOW') => void;
  readonly onTargetRate: (value: string) => void;
}

const CURRENCY_OPTIONS = CURRENCIES.map((code) => ({ value: code, label: code }));

const DIRECTION_OPTIONS = [
  { value: 'ABOVE', label: 'goes above' },
  { value: 'BELOW', label: 'drops below' },
];

/** The pair, the direction and the target. */
function AlertFields(props: AlertFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <FormField label="From" required>
        <Select
          options={CURRENCY_OPTIONS}
          value={props.from}
          onChange={(event) => props.onFrom(event.target.value)}
        />
      </FormField>

      <FormField label="To" required>
        <Select
          options={CURRENCY_OPTIONS}
          value={props.to}
          onChange={(event) => props.onTo(event.target.value)}
        />
      </FormField>

      <FormField label="When it" required>
        <Select
          options={DIRECTION_OPTIONS}
          value={props.direction}
          onChange={(event) => props.onDirection(event.target.value as 'ABOVE' | 'BELOW')}
        />
      </FormField>

      <FormField label="This rate" required>
        <Input
          inputMode="decimal"
          placeholder="1.2000"
          value={props.targetRate}
          onChange={(event) => props.onTargetRate(event.target.value)}
        />
      </FormField>
    </div>
  );
}

/** The alerts already set, or an explanation of why setting one is worth it. */
function AlertList({
  query,
  onRemove,
}: {
  readonly query: UseQueryResult<FxAlert[]>;
  readonly onRemove: (id: string) => void;
}) {
  return (
    <QueryPanel
      query={query}
      skeletonRows={1}
      isEmpty={(list) => list.length === 0}
      empty={NO_ALERTS}
    >
      {(list) => (
        <ul className="flex flex-col">
          {list.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </QueryPanel>
  );
}
