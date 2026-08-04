/**
 * `/customers` — where support and compliance both start.
 */

import type { Metadata } from 'next';

import { CustomerSearch } from '@/components/customers/customer-search';

export const metadata: Metadata = {
  title: 'Customers',
};

/** The customer search screen. */
export default function CustomersPage() {
  return <CustomerSearch />;
}
