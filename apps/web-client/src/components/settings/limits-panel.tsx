'use client';

/**
 * What is left of each limit today.
 *
 * A limit only matters at the moment somebody is about to exceed it, so the useful number is the
 * *remaining* allowance rather than the cap. `LimitMeter` puts the money in the accessible value,
 * because "68 per cent" is not what anybody needs to hear.
 *
 * The figures come from the customer's product terms; the bank does not publish a per-customer
 * usage endpoint, so what is shown is the ceiling and the day it resets.
 */

import { LimitMeter } from '@reliance/ui';

import { Section } from '@/components/transfers';

/** A limit, and what has gone against it. */
export interface LimitRow {
  readonly id: string;
  readonly label: string;
  /** Minor units used so far in the window. */
  readonly used: string;
  /** Minor units the limit allows. */
  readonly limit: string;
  readonly currency: string;
  readonly hint: string;
}

/** Props for {@link LimitsPanel}. */
export interface LimitsPanelProps {
  readonly rows: readonly LimitRow[];
}

/**
 * @example <LimitsPanel rows={rows} />
 */
export function LimitsPanel({ rows }: LimitsPanelProps) {
  return (
    <Section
      title="Your limits"
      description="How much you can move in a day, and how much of that is left."
    >
      <div className="flex flex-col gap-6">
        {rows.map((row) => (
          <LimitMeter
            key={row.id}
            label={row.label}
            used={row.used}
            limit={row.limit}
            currency={row.currency as never}
            hint={row.hint}
          />
        ))}
      </div>
    </Section>
  );
}
