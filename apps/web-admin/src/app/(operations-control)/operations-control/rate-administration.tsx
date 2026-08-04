/**
 * Exchange-rate administration.
 *
 * The mid-market rate is what every customer quote is struck from: the spread is applied
 * on top of it and shown to the customer as an amount of money, never hidden in the rate.
 * Publishing a new mid therefore moves every quote in the bank at once, and it fires any
 * customer rate alert it crosses on the way — which the panel says, because an operator
 * who publishes a large move without expecting the notifications will assume something
 * has gone wrong.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { FxRate } from '@reliance/contracts';
import { Alert, Button, FormField, Input, Select } from '@reliance/ui';

import { Panel, QueryState, opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatBasisPoints, formatInstant } from '@/lib/format';

const CELL = 'px-3 py-2 align-middle';
const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';

function pairOf(rate: FxRate): string {
  return `${rate.from}/${rate.to}`;
}

function RateRow({ rate }: Readonly<{ rate: FxRate }>) {
  const weaker = rate.changeBps < 0;

  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className={`${CELL} text-left font-medium`}>
        {pairOf(rate)}
      </th>
      <td className={`${CELL} font-mono tabular-nums`}>{rate.mid}</td>
      <td className={`${CELL} font-mono tabular-nums`}>{rate.bid}</td>
      <td className={`${CELL} font-mono tabular-nums`}>{rate.ask}</td>
      <td className={CELL}>{formatBasisPoints(rate.spreadBps)}</td>
      <td className={CELL}>
        <span className={weaker ? 'text-debit' : 'text-credit'}>
          {weaker ? 'Weaker by ' : 'Stronger by '}
          {formatBasisPoints(Math.abs(rate.changeBps))}
        </span>
      </td>
      <td className={`${CELL} font-mono text-xs`}>{formatInstant(rate.asOf)}</td>
    </tr>
  );
}

interface PublishFormProps {
  readonly rates: readonly FxRate[];
}

/** Which pair, and what to move it to. */
function PublishFields({
  rates,
  pair,
  mid,
  selected,
  onPair,
  onMid,
}: {
  readonly rates: readonly FxRate[];
  readonly pair: string;
  readonly mid: string;
  readonly selected: FxRate | undefined;
  readonly onPair: (next: string) => void;
  readonly onMid: (next: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Currency pair" required>
        <Select
          value={pair}
          options={rates.map((rate) => ({ value: pairOf(rate), label: pairOf(rate) }))}
          onChange={(event) => onPair(event.target.value)}
        />
      </FormField>
      <FormField
        label="New mid-market rate"
        required
        hint={
          selected
            ? `Currently ${selected.mid}. Bid and ask are derived from the spread.`
            : undefined
        }
      >
        <Input value={mid} inputMode="decimal" onChange={(event) => onMid(event.target.value)} />
      </FormField>
    </div>
  );
}

function PublishForm({ rates }: PublishFormProps) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [pair, setPair] = useState(rates[0] ? pairOf(rates[0]) : '');
  const [mid, setMid] = useState('');

  const selected = rates.find((rate) => pairOf(rate) === pair);

  const publish = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Choose a currency pair first.');
      return client.simulation.moveRate({ from: selected.from, to: selected.to, newMid: mid });
    },
    onSuccess: () => {
      setMid('');
      queryClient.invalidateQueries({ queryKey: opsKeys.rateBoard() });
    },
  });

  // A bare decimal. Anything else — a comma, a currency symbol, a minus — is not a rate.
  const valid = /^\d+(?:\.\d+)?$/.test(mid);

  return (
    <div className="flex flex-col gap-3">
      {publish.error && <Alert tone="danger">{messageFor(publish.error)}</Alert>}

      <PublishFields
        rates={rates}
        pair={pair}
        mid={mid}
        selected={selected}
        onPair={setPair}
        onMid={setMid}
      />

      <div>
        <Button loading={publish.isPending} disabled={!valid} onClick={() => publish.mutate()}>
          Publish this rate
        </Button>
      </div>
    </div>
  );
}

/** Column headings for the board, in order. */
const BOARD_HEADINGS = [
  'Pair',
  'Mid',
  'Bid',
  'Ask',
  'Spread',
  'Against previous close',
  'As at (UTC)',
] as const;

/** The published board itself. */
function RateBoard({ rates }: { readonly rates: readonly FxRate[] }) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">Published exchange rates</caption>
        <thead>
          <tr className="border-border bg-surface-sunken border-b">
            {BOARD_HEADINGS.map((heading) => (
              <th key={heading} scope="col" className={HEAD}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => (
            <RateRow key={pairOf(rate)} rate={rate} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The published board and the control that moves a rate on it. */
export function RateAdministration() {
  const client = useApiClient();

  const query = useQuery({
    queryKey: opsKeys.rateBoard(),
    queryFn: async ({ signal }) => client.fx.rates(undefined, { signal }),
  });

  const rates = query.data?.data ?? [];

  return (
    <Panel
      title="Exchange rates"
      description="The mid-market rates every customer quote is struck from."
    >
      <QueryState query={query} subject="the exchange-rate board">
        <div className="flex flex-col gap-4">
          <Alert tone="info" title="Publishing moves every quote at once">
            Customer quotes are struck from the mid with the spread applied on top, and any customer
            rate alert the move crosses is sent immediately.
          </Alert>

          <RateBoard rates={rates} />

          {rates.length > 0 && <PublishForm rates={rates} />}
        </div>
      </QueryState>
    </Panel>
  );
}
