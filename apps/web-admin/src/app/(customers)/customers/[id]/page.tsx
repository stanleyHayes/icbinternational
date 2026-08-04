/**
 * `/customers/{id}` — one customer, everything about them.
 *
 * The identifier is read on the server and handed down as a plain string, so the client
 * tree never has to reason about a route parameter arriving late. Everything below this
 * point is a client component: the record is live data an operator acts on, not a page
 * that can be cached.
 */

import type { Metadata } from 'next';

import { CustomerRecord } from '@/components/customers/dossier/customer-record';

export const metadata: Metadata = {
  title: 'Customer record',
};

interface CustomerPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

/** One customer's record. */
export default async function CustomerPage({ params }: CustomerPageProps) {
  const { id } = await params;
  return <CustomerRecord customerId={id} />;
}
