'use client';

/**
 * The receipt.
 *
 * The thing a customer forwards to a landlord to prove the rent went out, so it has to carry the
 * facts somebody else will check: who was paid, how much, when, and the reference the receiving
 * bank will quote back. The rail reference is copyable, because it is the string that gets read
 * out on the phone.
 */

import type { Transfer } from '@reliance/contracts';
import { MoneyText, StatusPill } from '@reliance/ui';

import {
  CopyButton,
  describeDestination,
  type Detail,
  DetailList,
  RAIL_LOOK,
  TRANSFER_STATUS,
} from '@/components/transfers';
import { formatDateTime } from '@/lib/format';

const SORT_CODE_GROUP = /(\d{2})(?=\d)/g;

/** Props for {@link TransferReceipt}. */
export interface TransferReceiptProps {
  readonly transfer: Transfer;
}

/** The account the money went to, in the form that bank uses. */
function accountLine(transfer: Transfer): string | undefined {
  const { destination } = transfer;
  if (destination.kind === 'DOMESTIC') {
    return `${destination.sortCode.replaceAll(SORT_CODE_GROUP, '$1-')} · ${destination.accountNumber}`;
  }
  if (destination.kind === 'INTERNATIONAL') return destination.iban;
  return destination.accountNumber;
}

function coreRows(transfer: Transfer): Detail[] {
  return [
    {
      id: 'payee',
      label: 'Paid to',
      value: describeDestination(transfer.destination),
      note: accountLine(transfer),
    },
    {
      id: 'amount',
      label: 'Amount',
      value: (
        <MoneyText
          amount={transfer.debitAmount.amount}
          currency={transfer.debitAmount.currency}
          size="lg"
          srLabel="Amount taken from your account"
        />
      ),
    },
    {
      id: 'fee',
      label: 'Fee',
      value: <MoneyText amount={transfer.fee.amount} currency={transfer.fee.currency} muted />,
    },
    { id: 'rail', label: 'Sent by', value: RAIL_LOOK[transfer.rail].name },
    { id: 'sent', label: 'Sent', value: formatDateTime(transfer.createdAt) },
  ];
}

function traceRows(transfer: Transfer): Detail[] {
  const rows: Detail[] = [];

  if (transfer.exchangeRate) {
    rows.push({
      id: 'rate',
      label: 'Exchange rate used',
      value: <span className="font-mono tabular-nums">{transfer.exchangeRate}</span>,
    });
  }

  if (transfer.reference) {
    rows.push({ id: 'reference', label: 'Your reference', value: transfer.reference });
  }

  if (transfer.railReference) {
    rows.push({
      id: 'rail-reference',
      label: 'Payment reference',
      value: <TraceReference reference={transfer.railReference} />,
      note: 'Quote this if you or the payee ever need to trace the payment.',
    });
  }

  if (transfer.returnReason) {
    rows.push({ id: 'return', label: 'Why it came back', value: transfer.returnReason });
  }

  return rows;
}

/** The rail's own identifier, with a control to copy it exactly. */
function TraceReference({ reference }: { readonly reference: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs">{reference}</span>
      <CopyButton value={reference} subject="payment reference" />
    </span>
  );
}

/**
 * @example <TransferReceipt transfer={transfer} />
 */
export function TransferReceipt({ transfer }: TransferReceiptProps) {
  const status = TRANSFER_STATUS[transfer.status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-fg-muted text-sm font-semibold tracking-wide uppercase">
          Reliance Bank · payment receipt
        </p>
        <StatusPill tone={status.tone} label={status.label} />
      </div>
      <DetailList items={[...coreRows(transfer), ...traceRows(transfer)]} />
    </div>
  );
}
