'use client';

/**
 * What the bank lends, and at what representative rate.
 *
 * The catalogue doubles as the eligibility form's input, so it is fetched once here and handed
 * down rather than re-fetched by each panel that needs it.
 */

import { useQuery } from '@tanstack/react-query';

import { movementKeys, QueryPanel } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { EligibilityPanel } from './eligibility-panel';

/**
 * @example <ProductsPanel />
 */
export function ProductsPanel() {
  const products = useQuery({
    queryKey: movementKeys.borrow.products(),
    queryFn: async () => (await browserApi().borrow.products()).data,
  });

  return (
    <QueryPanel query={products} skeletonRows={2}>
      {(list) => <EligibilityPanel products={list} />}
    </QueryPanel>
  );
}
