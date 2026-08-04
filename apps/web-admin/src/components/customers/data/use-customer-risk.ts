/**
 * The risk and contact records that name this customer.
 *
 * Everything here is filtered on a field the record itself carries — `userId` on an
 * identity case, an alert, an investigation or a screening hit; the disputed
 * transaction's id on a dispute. Nothing is associated by position or by trusting a
 * filter the console asked for.
 *
 * Support tickets are the exception the contract forces, and the code says so where it
 * happens rather than in a comment nobody reads: a `Ticket` carries no customer id, so
 * the only link available is the name on the first message the customer sent. That is
 * matched exactly and case-insensitively, and it is deliberately conservative — a
 * near-miss shows nothing rather than showing somebody else's correspondence.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { ScreeningHit } from '@reliance/api-client';
import type { AmlAlert, AmlCase, Dispute, KycCase, Ticket } from '@reliance/contracts';

import { QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

import { customerKeys } from './keys';

/** Everything the risk side of the bank holds against one customer. */
export interface CustomerRisk {
  readonly kycCases: readonly KycCase[];
  readonly alerts: readonly AmlAlert[];
  readonly cases: readonly AmlCase[];
  readonly screeningHits: readonly ScreeningHit[];
}

/** Identity, screening, monitoring and investigation records naming this customer. */
export function useCustomerRisk(customerId: string) {
  const client = useApiClient();
  const query = { limit: QUEUE_PAGE_SIZE } as const;

  return useQuery({
    queryKey: customerKeys.risk(customerId),
    queryFn: async ({ signal }): Promise<CustomerRisk> => {
      const [kyc, alerts, cases, screening] = await Promise.all([
        client.admin.kycQueue(query, { signal }),
        client.admin.amlAlerts(query, { signal }),
        client.admin.amlCases(query, { signal }),
        client.admin.screeningHits(query, { signal }),
      ]);

      return {
        kycCases: kyc.data.filter((record) => record.userId === customerId),
        alerts: alerts.data.filter((record) => record.userId === customerId),
        cases: cases.data.filter((record) => record.userId === customerId),
        screeningHits: screening.data.filter((record) => record.userId === customerId),
      };
    },
    ...queueQueryOptions,
  });
}

/**
 * The name on the first message a customer sent, which is the only customer identifier a
 * ticket carries.
 */
export function ticketRaisedBy(ticket: Ticket): string | null {
  return ticket.messages.find((message) => message.authorType === 'CUSTOMER')?.authorName ?? null;
}

/** Correspondence and chargebacks attributable to this customer. */
export interface CustomerContacts {
  readonly tickets: readonly Ticket[];
  readonly disputes: readonly Dispute[];
}

/** Tickets raised by this customer, and disputes against their postings. */
export function useCustomerContacts(
  customerId: string,
  customerName: string,
  transactionIds: readonly string[],
) {
  const client = useApiClient();
  const query = { limit: QUEUE_PAGE_SIZE } as const;
  const wanted = customerName.trim().toLowerCase();

  return useQuery({
    queryKey: [...customerKeys.contacts(customerId), wanted, transactionIds],
    enabled: wanted.length > 0,
    queryFn: async ({ signal }): Promise<CustomerContacts> => {
      const [tickets, disputes] = await Promise.all([
        client.admin.tickets(query, { signal }),
        client.admin.disputes(query, { signal }),
      ]);
      const owned = new Set(transactionIds);

      return {
        tickets: tickets.data.filter(
          (ticket) => ticketRaisedBy(ticket)?.trim().toLowerCase() === wanted,
        ),
        disputes: disputes.data.filter((dispute) => owned.has(dispute.transactionId)),
      };
    },
    ...queueQueryOptions,
  });
}
