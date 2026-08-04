'use client';

/**
 * The rate board.
 *
 * `RateTicker` carries the brand's rule that a movement is never colour alone: every row has an
 * arrow, a signed figure and a screen-reader word. The board is quoted against one base currency
 * at a time, because a matrix of every pair against every other is a table nobody reads.
 */

import { useQuery } from '@tanstack/react-query';

import type { FxRate } from '@reliance/contracts';
import { RateTicker, type RateTrend } from '@reliance/ui';

import { movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const BASE = 'GBP';
const BPS_PER_PERCENT = 100;
const PERCENT_DECIMALS = 2;

/** Which way the pair has moved since the previous close. */
function trendOf(changeBps: number): RateTrend {
  if (changeBps > 0) return 'up';
  return changeBps < 0 ? 'down' : 'flat';
}

/** The change against the previous close, signed and as a percentage. */
function changeLabel(changeBps: number): string {
  const percent = (changeBps / BPS_PER_PERCENT).toFixed(PERCENT_DECIMALS);
  return changeBps > 0 ? `+${percent}%` : `${percent}%`;
}

function Row({ rate }: { readonly rate: FxRate }) {
  return (
    <li className="border-border border-b py-3 last:border-0">
      <RateTicker
        base={rate.from}
        quote={rate.to}
        rate={rate.mid}
        trend={trendOf(rate.changeBps)}
        change={changeLabel(rate.changeBps)}
        asOf={formatDateTime(rate.asOf)}
      />
    </li>
  );
}

/**
 * @example <RateBoard />
 */
export function RateBoard() {
  const board = useQuery({
    queryKey: movementKeys.fx.board(BASE),
    queryFn: async () => (await browserApi().fx.board({ base: BASE })).data,
  });

  return (
    <Section
      title="Today's rates"
      description="Mid-market rates. The rate you get is quoted with the spread shown separately."
    >
      <QueryPanel query={board} skeletonRows={4}>
        {(data) => (
          <ul className="flex flex-col">
            {data.rates.map((rate) => (
              <Row key={`${rate.from}-${rate.to}`} rate={rate} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
