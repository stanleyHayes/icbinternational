/**
 * Business-date management.
 *
 * A bank's idea of "today" is not its servers' idea of it. The business date is what value
 * dates are struck against, what statement cycles turn on, and what decides whether a
 * payment made at one minute past midnight belongs to yesterday's settlement batch. Moving
 * it is an operations decision, and moving it forward runs every scheduled process the
 * jump passes over — because a book that skipped a day's accrual is a book that is wrong.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { SimClock } from '@reliance/contracts';
import { Alert, Button, FormField, Input, StatusPill, Switch } from '@reliance/ui';

import { KpiTile, Panel, QueryState, opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatInstant } from '@/lib/format';

/** Longest jump the platform accepts, in days. */
const MAX_DAYS = 3650;

function Figures({ clock }: Readonly<{ clock: SimClock }>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="Business date and time"
        value={<span className="font-mono text-lg">{formatInstant(clock.simulatedNow)}</span>}
        hint="What every service in the bank believes the time to be."
      />
      <KpiTile
        label="System time"
        value={<span className="font-mono text-lg">{formatInstant(clock.realNow)}</span>}
        hint="The servers' own clock, for comparison."
      />
      <KpiTile
        label="Held"
        tone={clock.frozen ? 'warning' : 'success'}
        value={clock.frozen ? 'Yes' : 'No'}
        hint={
          clock.frozen
            ? 'The business date is not advancing on its own.'
            : 'The business date advances with system time.'
        }
      />
    </div>
  );
}

interface AdvanceFormProps {
  readonly onAdvance: (input: { days: number; hours: number; runScheduledJobs: boolean }) => void;
  readonly isBusy: boolean;
}

/** Days and hours, side by side. Free text so a half-typed number is not clamped mid-edit. */
function JumpFields({
  days,
  hours,
  onDays,
  onHours,
}: {
  readonly days: string;
  readonly hours: string;
  readonly onDays: (next: string) => void;
  readonly onHours: (next: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Days forward">
        <Input inputMode="numeric" value={days} onChange={(event) => onDays(event.target.value)} />
      </FormField>
      <FormField label="Hours forward">
        <Input
          inputMode="numeric"
          value={hours}
          onChange={(event) => onHours(event.target.value)}
        />
      </FormField>
    </div>
  );
}

function AdvanceForm({ onAdvance, isBusy }: AdvanceFormProps) {
  const [days, setDays] = useState('1');
  const [hours, setHours] = useState('0');
  const [runJobs, setRunJobs] = useState(true);

  const dayCount = Number(days) || 0;
  const hourCount = Number(hours) || 0;
  const valid = dayCount + hourCount > 0 && dayCount <= MAX_DAYS;

  return (
    <div className="flex flex-col gap-3">
      <JumpFields days={days} hours={hours} onDays={setDays} onHours={setHours} />

      <Switch
        checked={runJobs}
        onChange={(event) => setRunJobs(event.target.checked)}
        description="Interest accrual, standing orders, settlement, statements and arrears, in runbook order."
      >
        Run every scheduled process the jump passes over
      </Switch>

      <div>
        <Button
          loading={isBusy}
          disabled={!valid}
          onClick={() => onAdvance({ days: dayCount, hours: hourCount, runScheduledJobs: runJobs })}
        >
          Advance the business date
        </Button>
      </div>
    </div>
  );
}

/** The business date, and the controls that move it. */
/**
 * The business date and the three ways to move it.
 *
 * All three invalidate everything rather than one key: moving the date changes balances,
 * schedules and queues across the whole console, so any cached answer is now describing a
 * different day.
 */
function useBusinessDate() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: opsKeys.processingState(),
    queryFn: async ({ signal }) => (await client.simulation.clock({ signal })).data,
  });

  const refresh = (): void => {
    queryClient.invalidateQueries();
  };

  const advance = useMutation({
    mutationFn: async (input: { days: number; hours: number; runScheduledJobs: boolean }) =>
      client.simulation.advance({ ...input, minutes: 0 }),
    onSuccess: refresh,
  });

  const hold = useMutation({
    mutationFn: async (frozen: boolean) => client.simulation.setClock({ frozen }),
    onSuccess: refresh,
  });

  const reset = useMutation({
    mutationFn: async () => client.simulation.resetClock(),
    onSuccess: refresh,
  });

  return { query, advance, hold, reset, error: advance.error ?? hold.error ?? reset.error };
}

type BusinessDate = ReturnType<typeof useBusinessDate>;

/** Everything below the panel header, once the current date is known. */
function DateControls({
  clock,
  error,
  advance,
  hold,
  reset,
}: {
  readonly clock: NonNullable<BusinessDate['query']['data']>;
  readonly error: unknown;
  readonly advance: BusinessDate['advance'];
  readonly hold: BusinessDate['hold'];
  readonly reset: BusinessDate['reset'];
}) {
  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{messageFor(error)}</Alert> : null}

      <Figures clock={clock} />

      <Alert tone="info" title="Advancing runs the day">
        Moving the date forward replays every scheduled process between here and there, in order.
        Skipping them would leave the book in a state no sequence of real events could produce.
      </Alert>

      <AdvanceForm onAdvance={(input) => advance.mutate(input)} isBusy={advance.isPending} />

      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
        <Button
          variant="secondary"
          loading={hold.isPending}
          onClick={() => hold.mutate(!clock.frozen)}
        >
          {clock.frozen ? 'Let the date advance again' : 'Hold the business date'}
        </Button>
        <Button variant="ghost" loading={reset.isPending} onClick={() => reset.mutate()}>
          Return to system time
        </Button>
      </div>
    </div>
  );
}

export function BusinessDatePanel() {
  const { query, advance, hold, reset, error } = useBusinessDate();

  return (
    <Panel
      title="Business date"
      description="What the bank believes today to be, and the controls that move it."
      action={
        query.data && (
          <StatusPill
            tone={query.data.frozen ? 'warning' : 'success'}
            label={query.data.frozen ? 'Held' : 'Advancing'}
          />
        )
      }
    >
      <QueryState query={query} subject="the business date">
        {query.data && (
          <DateControls
            clock={query.data}
            error={error}
            advance={advance}
            hold={hold}
            reset={reset}
          />
        )}
      </QueryState>
    </Panel>
  );
}
