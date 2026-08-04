'use client';

/**
 * Receipts for bills the customer has paid.
 *
 * The biller's own receipt token is the useful part: it is what somebody quotes to a utility
 * company that says it never received the money. So it is shown, and it is copyable.
 */

import { useQuery } from '@tanstack/react-query';

import type { BillPayment } from '@reliance/contracts';
import { StatusPill } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import {
  BILL_STATUS,
  CopyButton,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const NO_RECEIPTS = (
  <EmptyPanel
    title="No bill payments yet"
    description="Bills you pay through us appear here with the biller's own receipt, which is what they will ask for if anything goes missing."
  />
);

function ReceiptRow({ payment }: { readonly payment: BillPayment }) {
  const status = BILL_STATUS[payment.status];

  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <span className="min-w-0">
        <span className="text-fg block truncate text-sm font-medium">{payment.billerName}</span>
        <span className="text-fg-muted mt-0.5 block text-xs">
          {formatDateTime(payment.createdAt)} · {payment.customerReference}
        </span>
        {payment.billerReceipt ? (
          <span className="text-fg-subtle mt-1 inline-flex items-center gap-1 text-xs">
            <span className="font-mono">{payment.billerReceipt}</span>
            <CopyButton value={payment.billerReceipt} subject="biller receipt" />
          </span>
        ) : null}
        {payment.failureReason ? (
          <span className="text-danger mt-1 block text-xs">{payment.failureReason}</span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-3">
        <StatusPill tone={status.tone} label={status.label} />
        <MoneyCell money={payment.amount} negative signed srLabel="Amount paid" />
      </span>
    </li>
  );
}

/**
 * @example <ReceiptsPanel />
 */
export function ReceiptsPanel() {
  const payments = useQuery({
    queryKey: movementKeys.payments.billPayments(),
    queryFn: async () => (await browserApi().payments.listBillPayments()).data,
  });

  return (
    <Section title="Bill payment receipts" description="Everything you have paid through us.">
      <QueryPanel
        query={payments}
        skeletonRows={3}
        isEmpty={(list) => list.length === 0}
        empty={NO_RECEIPTS}
      >
        {(list) => (
          <ul className="flex flex-col">
            {list.map((payment) => (
              <ReceiptRow key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
