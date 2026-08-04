'use client';

/**
 * What the conversion actually costs.
 *
 * The spread appears as **money**, not only as basis points, because a spread expressed as
 * "25 bps" is a cost nobody can feel. The exact amount that will arrive is the largest figure on
 * the panel, since it is the only one the customer will check afterwards.
 */

import type { FxQuote } from '@reliance/contracts';

import { DetailList, MoneyCell, type Detail } from '@/components/transfers';

const BPS_PER_PERCENT = 100;
const PERCENT_DECIMALS = 2;

/** Props for {@link ConversionSummary}. */
export interface ConversionSummaryProps {
  readonly quote: FxQuote;
}

function rows(quote: FxQuote): Detail[] {
  const spreadPercent = (quote.spreadBps / BPS_PER_PERCENT).toFixed(PERCENT_DECIMALS);

  return [
    {
      id: 'sell',
      label: `You give us`,
      value: <MoneyCell money={quote.sellAmount} size="lg" srLabel="Amount converted from" />,
    },
    {
      id: 'buy',
      label: 'You get exactly',
      value: <MoneyCell money={quote.buyAmount} size="lg" srLabel="Amount you receive" />,
    },
    {
      id: 'rate',
      label: 'Rate',
      value: <span className="font-mono tabular-nums">{quote.rate}</span>,
      note: `Mid-market rate is ${quote.midRate}.`,
    },
    {
      id: 'spread',
      label: 'Our margin on the rate',
      value: <MoneyCell money={quote.spreadCost} muted />,
      note: `${spreadPercent}% of the amount, included in the rate above rather than charged separately.`,
    },
    { id: 'fee', label: 'Fee', value: <MoneyCell money={quote.fee} muted /> },
  ];
}

/**
 * @example <ConversionSummary quote={quote} />
 */
export function ConversionSummary({ quote }: ConversionSummaryProps) {
  return <DetailList items={rows(quote)} />;
}
