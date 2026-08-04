/**
 * `/products` — the product catalogue and its editor.
 */

import type { Metadata } from 'next';

import { ProductsScreen } from './products-screen';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Rates, fees, limits and effective-dated product versions.',
};

/** The product studio. */
export default function ProductsPage() {
  return <ProductsScreen />;
}
