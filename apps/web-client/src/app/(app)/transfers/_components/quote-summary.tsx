'use client';

/**
 * What the payment will actually cost, and when it will actually arrive.
 *
 * Every figure the bank knows, stated before the customer commits: what leaves the account, what
 * lands, the fee as money rather than as a rate, the exchange rate if there is one, and the
 * arrival estimate as a date a person can plan around. Anything the quote warns about is shown as
 * a warning, not folded into small print.
 */

import type { Money as ContractMoney, TransferQuote } from '@reliance/contracts';
import { Alert, MoneyText } from '@reliance/ui';

import { type Detail, DetailList, RAIL_LOOK } from '@/components/transfers';
import { formatDateTime } from '@/lib/format';

/** Props for {@link QuoteSummary}. */
export interface QuoteSummaryProps {
  readonly quote: TransferQuote;
}

function amountCell(amount: ContractMoney, srLabel: string) {
  return (
    <MoneyText amount={amount.amount} currency={amount.currency} size="lg" srLabel={srLabel} />
  );
}

function movementRows(quote: TransferQuote): Detail[] {
  return [
    {
      id: 'debit',
      label: 'Leaves your account',
      value: amountCell(quote.debitAmount, 'Amount leaving your account'),
    },
    {
      id: 'credit',
      label: 'They receive',
      value: amountCell(quote.creditAmount, 'Amount they receive'),
    },
    {
      id: 'fee',
      label: 'Our fee',
      value: <MoneyText amount={quote.fee.amount} currency={quote.fee.currency} muted />,
      note: quote.fee.amount === '0' ? 'There is no charge for this payment.' : undefined,
    },
  ];
}

function deliveryRows(quote: TransferQuote): Detail[] {
  const rail = RAIL_LOOK[quote.rail];

  return [
    { id: 'rail', label: 'How it is sent', value: rail.name, note: rail.speed },
    {
      id: 'arrival',
      label: 'Expected to arrive',
      value: formatDateTime(quote.estimatedArrival),
      note: quote.cutOffAt ? `Today's cut-off is ${formatDateTime(quote.cutOffAt)}.` : undefined,
    },
  ];
}

function rateRows(quote: TransferQuote): Detail[] {
  if (!quote.exchangeRate) return [];

  return [
    {
      id: 'rate',
      label: 'Exchange rate',
      value: <span className="font-mono tabular-nums">{quote.exchangeRate}</span>,
      note: 'Held for you until the countdown runs out.',
    },
  ];
}

/**
 * @example <QuoteSummary quote={quote} />
 */
export function QuoteSummary({ quote }: QuoteSummaryProps) {
  const rows = [...movementRows(quote), ...rateRows(quote), ...deliveryRows(quote)];

  return (
    <div className="flex flex-col gap-4">
      <DetailList items={rows} />

      {quote.warnings.map((warning) => (
        <Alert key={warning} tone="warning" title="Worth knowing">
          {warning}
        </Alert>
      ))}

      {quote.requiresStepUp ? (
        <Alert tone="info" title="We will ask you to confirm it is you">
          Because of the amount, we will ask for a second check before this payment is sent.
        </Alert>
      ) : null}
    </div>
  );
}
