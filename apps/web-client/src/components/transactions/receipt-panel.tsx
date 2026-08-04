'use client';

/**
 * The receipt for one movement.
 *
 * Rendered from the transaction record rather than from the HTML the receipt endpoint returns.
 * Injecting server-rendered markup into the page would mean trusting a payee's name never to
 * contain a `<script>`, and a receipt is precisely the surface where an attacker controls a
 * string — the merchant descriptor. The endpoint is still called, for the bank's own reference
 * and for the signed PDF link, which is the artefact a customer actually forwards.
 *
 * The panel prints. `print:` utilities strip the chrome so a browser's Print produces a receipt
 * rather than a screenshot of an application.
 */

import { FileDown, Printer } from 'lucide-react';

import type { Transaction } from '@reliance/contracts';
import { Button, Card, CardHeader, MoneyText, Skeleton } from '@reliance/ui';

import { formatDate, formatDateTime } from '@/lib/format';

import { signedAmount } from './amounts';
import { DefinitionList, type DefinitionRow } from './definition-list';
import { ENTRY_TYPE_LABEL, STATUS_LABEL } from './labels';
import { useTransactionReceipt } from './use-transactions';

function receiptRows(transaction: Transaction, reference: string | null): readonly DefinitionRow[] {
  return [
    { label: 'Paid to', value: transaction.counterparty?.name ?? transaction.description },
    {
      label: 'Amount',
      value: (
        <MoneyText
          amount={signedAmount(transaction)}
          currency={transaction.amount.currency}
          size="lg"
          signed
        />
      ),
    },
    { label: 'Date', value: formatDateTime(transaction.bookedAt) },
    {
      label: 'Cleared',
      value: transaction.completedAt ? formatDate(transaction.completedAt) : null,
    },
    { label: 'Payment type', value: ENTRY_TYPE_LABEL[transaction.type] },
    { label: 'Status', value: STATUS_LABEL[transaction.status] },
    { label: 'Our reference', value: reference },
  ];
}

/** Props for {@link ReceiptPanel}. */
export interface ReceiptPanelProps {
  readonly transaction: Transaction;
}

/**
 * @example <ReceiptPanel transaction={transaction} />
 */
export function ReceiptPanel({ transaction }: ReceiptPanelProps) {
  const receipt = useTransactionReceipt(transaction.id);
  const reference = receipt.data?.reference ?? transaction.reference;
  const downloadUrl = receipt.data?.downloadUrl ?? null;

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader
        title="Receipt"
        description="Proof of this payment, for your records or for whoever asked for it."
        action={
          <div className="flex gap-2 print:hidden">
            <Button
              variant="secondary"
              onClick={() => globalThis.print()}
              startIcon={<Printer aria-hidden="true" className="size-4" />}
            >
              Print
            </Button>
            {downloadUrl ? (
              <Button
                variant="secondary"
                onClick={() => globalThis.open(downloadUrl, '_blank', 'noopener')}
                startIcon={<FileDown aria-hidden="true" className="size-4" />}
              >
                Download PDF
              </Button>
            ) : null}
          </div>
        }
      />
      {receipt.isPending ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : (
        <DefinitionList className="mt-2" rows={receiptRows(transaction, reference)} />
      )}
    </Card>
  );
}
